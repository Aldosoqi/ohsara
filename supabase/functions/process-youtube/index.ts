import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openAIApiKey = Deno.env.get('OPENAI_API_KEY')!;
const geminiApiKey = Deno.env.get('GEMINI_API_KEY')!;
const apifyApiKey = Deno.env.get('APIFY_API_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { youtubeUrl, analysisType, customRequest } = await req.json();
    
    console.log(`🎬 Starting YouTube processing: ${youtubeUrl}`);
    console.log(`📊 Analysis type: ${analysisType}`);
    
    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Step 1: Validate YouTube URL
    const videoId = validateAndExtractVideoId(youtubeUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL. Please provide a valid YouTube video URL.');
    }

    console.log(`✅ Valid video ID extracted: ${videoId}`);

    // Step 2: Check and deduct credits
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.credits < 1) {
      throw new Error('Insufficient credits. Please purchase more credits to continue.');
    }

    // Deduct credit first
    const { error: creditError } = await supabase.rpc('update_user_credits', {
      user_id_param: user.id,
      credit_amount: -1,
      transaction_type_param: 'usage',
      description_param: 'YouTube video analysis'
    });

    if (creditError) {
      throw new Error('Failed to deduct credits');
    }

    console.log(`💳 Credit deducted for user: ${user.id}`);

    // Step 3: Extract transcript
    console.log('📝 Extracting transcript...');
    const transcriptData = await extractTranscript(videoId);
    
    if (!transcriptData.transcript) {
      console.log('❌ No transcript found, refunding credit...');
      // Refund credit if no transcript found
      await supabase.rpc('update_user_credits', {
        user_id_param: user.id,
        credit_amount: 1,
        transaction_type_param: 'refund',
        description_param: 'No transcript available - refunded'
      });
      
      return new Response(JSON.stringify({ 
        error: 'No transcript or captions available for this video. Your credit has been refunded.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`✅ Transcript extracted: ${transcriptData.transcript.length} characters`);

    // Step 4: Get video metadata
    const videoMetadata = transcriptData.metadata;
    console.log(`📹 Video metadata: ${videoMetadata.title}`);

    // Step 5: Create summary record in database
    const { data: summary, error: summaryError } = await supabase
      .from('summaries')
      .insert({
        user_id: user.id,
        youtube_url: youtubeUrl,
        video_title: videoMetadata.title,
        video_description: videoMetadata.description,
        thumbnail_url: videoMetadata.thumbnail,
        duration: videoMetadata.duration,
        summary: 'Processing...', // Will be updated with actual content
      })
      .select()
      .single();

    if (summaryError) {
      console.error('❌ Failed to save summary:', summaryError);
      throw new Error('Failed to create summary record');
    }

    console.log(`💾 Summary record created: ${summary.id}`);

    // Step 6: Process with AI (OpenAI first, fallback to Gemini)
    console.log('🤖 Starting AI analysis...');
    const analysisResult = await processWithAI(
      transcriptData.transcript, 
      analysisType, 
      customRequest, 
      videoMetadata
    );

    // Step 7: Format the final output with proper markdown
    const formattedResult = formatAnalysisOutput(analysisResult, analysisType, videoMetadata);

    // Step 8: Update summary in database with final result
    await supabase
      .from('summaries')
      .update({ 
        summary: formattedResult,
        updated_at: new Date().toISOString()
      })
      .eq('id', summary.id);

    console.log('✅ Analysis complete, returning streaming response');

    // Return streaming response
    return createStreamingResponse(formattedResult, summary, videoMetadata);

  } catch (error) {
    console.error('❌ Error in process-youtube function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Step 1: Enhanced URL validation
function validateAndExtractVideoId(url: string): string | null {
  try {
    // Clean the URL
    url = url.trim();
    
    // Various YouTube URL patterns
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        // Validate video ID format (11 characters, alphanumeric + _-)
        if (/^[a-zA-Z0-9_-]{11}$/.test(match[1])) {
          return match[1];
        }
      }
    }

    return null;
  } catch (error) {
    console.error('URL validation error:', error);
    return null;
  }
}

// Step 2: Enhanced transcript extraction with metadata
async function extractTranscript(videoId: string) {
  try {
    console.log(`🔍 Attempting to extract transcript for video: ${videoId}`);
    
    const response = await fetch(`https://api.apify.com/v2/acts/lhotanok~youtube-scraper/run-sync-get-dataset-items?token=${apifyApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startUrls: [`https://www.youtube.com/watch?v=${videoId}`],
        maxResults: 1,
        subtitlesFormat: 'text',
        subtitlesLangCodes: ['en', 'en-US', 'en-GB'],
        verboseLog: false
      }),
    });

    if (!response.ok) {
      throw new Error(`Apify API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('📊 Apify response received');

    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('No data returned from Apify');
    }

    const videoData = data[0];
    
    // Extract transcript
    let transcript = '';
    if (videoData.subtitles && videoData.subtitles.length > 0) {
      transcript = videoData.subtitles.join(' ');
      console.log(`✅ Transcript found: ${transcript.length} characters`);
    } else {
      console.log('❌ No subtitles found in video data');
    }

    // Extract metadata
    const metadata = {
      title: videoData.title || 'Unknown Title',
      description: videoData.description || '',
      thumbnail: videoData.thumbnail || '',
      duration: videoData.duration || 0,
      viewCount: videoData.viewCount || 0,
      publishDate: videoData.publishDate || null,
      channelName: videoData.channelName || 'Unknown Channel'
    };

    return {
      transcript: transcript.trim(),
      metadata
    };

  } catch (error) {
    console.error('❌ Transcript extraction error:', error);
    return {
      transcript: null,
      metadata: {
        title: 'Unknown Title',
        description: '',
        thumbnail: '',
        duration: 0,
        viewCount: 0,
        publishDate: null,
        channelName: 'Unknown Channel'
      }
    };
  }
}

// Step 3: Enhanced AI processing with fallback
async function processWithAI(transcript: string, analysisType: string, customRequest: string, metadata: any): Promise<string> {
  console.log('🤖 Attempting analysis with OpenAI first...');
  
  // Try OpenAI first
  try {
    const openAIResult = await processWithOpenAI(transcript, analysisType, customRequest, metadata);
    console.log('✅ OpenAI analysis successful');
    return openAIResult;
  } catch (error) {
    console.error('❌ OpenAI failed:', error);
    console.log('🔄 Falling back to Gemini...');
  }

  // Fallback to Gemini
  try {
    const geminiResult = await processWithGemini(transcript, analysisType, customRequest, metadata);
    console.log('✅ Gemini analysis successful');
    return geminiResult;
  } catch (error) {
    console.error('❌ Gemini also failed:', error);
    throw new Error('Both OpenAI and Gemini failed to process the content. Please try again later.');
  }
}

async function processWithOpenAI(transcript: string, analysisType: string, customRequest: string, metadata: any): Promise<string> {
  const prompt = buildAnalysisPrompt(transcript, analysisType, customRequest, metadata);
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4.1-2025-04-14',
      messages: [
        {
          role: 'system',
          content: `You are an expert video content analyzer. Your task is to provide detailed, well-structured analysis based on the user's requirements. 

CRITICAL FORMATTING REQUIREMENTS:
- Use proper markdown formatting with **bold**, *italic*, and clear headings
- Structure content with # for main headings, ## for subheadings, ### for sub-subheadings
- Use numbered lists (1. 2. 3.) and bullet points (- or •) where appropriate
- Make the content scannable and easy to read
- Bold important terms, key insights, and critical information
- Use blockquotes (>) for important quotes or statements from the video

Always provide comprehensive, actionable insights that justify the credit spent.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 16000
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function processWithGemini(transcript: string, analysisType: string, customRequest: string, metadata: any): Promise<string> {
  const prompt = buildAnalysisPrompt(transcript, analysisType, customRequest, metadata);
  
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `You are an expert video content analyzer. Your task is to provide detailed, well-structured analysis based on the user's requirements.

CRITICAL FORMATTING REQUIREMENTS:
- Use proper markdown formatting with **bold**, *italic*, and clear headings
- Structure content with # for main headings, ## for subheadings, ### for sub-subheadings  
- Use numbered lists (1. 2. 3.) and bullet points (- or •) where appropriate
- Make the content scannable and easy to read
- Bold important terms, key insights, and critical information
- Use blockquotes (>) for important quotes or statements from the video

Always provide comprehensive, actionable insights that justify the credit spent.

${prompt}`
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 16000
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Step 4: Enhanced prompt building
function buildAnalysisPrompt(transcript: string, analysisType: string, customRequest: string, metadata: any): string {
  const videoInfo = `
**Video Information:**
- **Title:** ${metadata.title}
- **Channel:** ${metadata.channelName}
- **Duration:** ${Math.floor(metadata.duration / 60)} minutes
- **Description:** ${metadata.description.substring(0, 200)}${metadata.description.length > 200 ? '...' : ''}
`;

  const basePrompt = `${videoInfo}

**Full Video Transcript:**
${transcript}

---

`;

  switch (analysisType) {
    case 'summary':
      return basePrompt + `
**TASK: Comprehensive Video Summary**

Create a detailed but concise summary of this video. Structure your response as follows:

# 📝 Video Summary: ${metadata.title}

## 🎯 Main Topic & Purpose
- What is this video about?
- What's the main goal or message?

## 📋 Key Points (in order of importance)
1. **[Most Important Point]** - Brief explanation
2. **[Second Important Point]** - Brief explanation
3. **[Third Important Point]** - Brief explanation
(Continue as needed)

## 💡 Main Takeaways
- What should viewers remember?
- What are the actionable insights?

## 🎭 Style & Approach
- How is the content presented?
- What's the tone and format?

Make it comprehensive yet digestible. Use bullet points and clear headings.`;

    case 'key-takeaways':
      return basePrompt + `
**TASK: Key Takeaways & Insights**

Extract the most valuable insights and actionable takeaways from this video.

# 🚀 Key Takeaways: ${metadata.title}

## 🎯 Top 5 Most Important Insights
1. **[Insight 1]** - Why this matters and how to apply it
2. **[Insight 2]** - Why this matters and how to apply it
3. **[Insight 3]** - Why this matters and how to apply it
4. **[Insight 4]** - Why this matters and how to apply it
5. **[Insight 5]** - Why this matters and how to apply it

## 💼 Practical Applications
- How can these insights be implemented?
- What are the next steps?

## ⚡ Quick Reference
- **Most important quote:** "[Key quote from video]"
- **Key number/statistic:** [Important data point]
- **Main recommendation:** [Primary advice given]

Focus on actionable, valuable insights that justify watching the entire video.`;

    case 'step-by-step':
      return basePrompt + `
**TASK: Step-by-Step Breakdown**

Create a detailed, sequential breakdown of all processes, methods, and steps mentioned in the video.

# 📋 Complete Step-by-Step Guide: ${metadata.title}

## 🎯 Overview
Brief description of what this process/method achieves.

## 📝 Detailed Steps

### Phase 1: [Phase Name]
1. **Step 1:** [Detailed explanation]
   - **Why:** [Rationale]
   - **How:** [Specific instructions]
   - **Tips:** [Additional advice]

2. **Step 2:** [Detailed explanation]
   - **Why:** [Rationale]
   - **How:** [Specific instructions]
   - **Tips:** [Additional advice]

(Continue for all phases and steps)

## ⚠️ Important Notes & Warnings
- Common mistakes to avoid
- Critical considerations

## ✅ Success Indicators
- How to know you're doing it right
- Expected outcomes at each stage

Make it actionable and complete - someone should be able to follow this without watching the video.`;

    case 'general-explanation':
      return basePrompt + `
**TASK: Clear Educational Explanation**

Explain all concepts, topics, and ideas discussed in this video in a clear, educational manner.

# 🎓 Complete Explanation: ${metadata.title}

## 📖 Main Concepts Explained

### Concept 1: [Name]
- **Definition:** [What it is]
- **Why it matters:** [Importance]
- **How it works:** [Mechanism/process]
- **Examples:** [Real-world applications]

### Concept 2: [Name]
- **Definition:** [What it is]
- **Why it matters:** [Importance]
- **How it works:** [Mechanism/process]
- **Examples:** [Real-world applications]

(Continue for all major concepts)

## 🔗 How Everything Connects
- Relationship between concepts
- The bigger picture

## 🤔 Common Questions & Clarifications
- Address potential confusion
- Clarify complex points

## 📚 Additional Context
- Background information
- Related topics mentioned

Make complex topics accessible to beginners while maintaining depth.`;

    case 'tech-review':
      return basePrompt + `
**TASK: Technical Analysis & Review**

Provide a comprehensive technical analysis of all technology, tools, methods, and technical concepts discussed.

# 🔧 Technical Review: ${metadata.title}

## 🛠️ Technologies/Tools Mentioned

### [Technology/Tool 1]
- **What it is:** [Description]
- **Use case:** [When to use it]
- **Pros:** [Advantages]
- **Cons:** [Limitations]
- **Alternatives:** [Other options]
- **Difficulty level:** [Beginner/Intermediate/Advanced]

(Continue for each technology)

## ⚖️ Technical Evaluation

### Strengths
- What works well
- Innovative aspects
- Best practices demonstrated

### Weaknesses
- Potential issues
- Missing considerations
- Outdated information

## 🎯 Technical Recommendations
- Who should use these techniques
- When to implement
- Prerequisites needed

## 🔍 Deep Dive Analysis
- Technical accuracy assessment
- Industry relevance
- Future-proofing considerations

Focus on technical merit, practicality, and real-world applicability.`;

    case 'custom':
      return basePrompt + `
**CUSTOM ANALYSIS REQUEST:** ${customRequest}

Based on the specific request above, analyze the video content and provide detailed insights that directly address what was asked for.

# 🎯 Custom Analysis: ${metadata.title}

## 📋 Specific Focus: ${customRequest}

[Provide detailed analysis specifically targeting the custom request]

## 🔍 Relevant Information Found
- Direct answers to the request
- Related insights
- Supporting evidence from the video

## 💡 Additional Insights
- Unexpected relevant information
- Broader context that supports the request

## 📝 Summary & Recommendations
- Key findings related to the request
- Next steps or recommendations

Structure your response to directly address the custom request while providing comprehensive value.`;

    default:
      return basePrompt + `
**TASK: General Analysis**

Provide a comprehensive analysis of this video content.

# 📊 Video Analysis: ${metadata.title}

## 🎯 Content Overview
[Main topics and themes]

## 💡 Key Insights
[Important information and takeaways]

## 📋 Detailed Breakdown
[Structured analysis of content]

## 🎭 Presentation & Style
[How content is delivered]

## 🔗 Relevance & Value
[Why this content matters]

Provide thorough, valuable analysis that justifies the viewer's time investment.`;
  }
}

// Step 5: Enhanced output formatting
function formatAnalysisOutput(content: string, analysisType: string, metadata: any): string {
  // Add timestamp and video information header
  const header = `# 🎬 Analysis Complete

**Video:** [${metadata.title}](https://youtube.com/watch?v=${extractVideoIdFromUrl(metadata.url) || ''})  
**Channel:** ${metadata.channelName}  
**Analyzed:** ${new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}

---

`;

  // Clean and enhance the content
  let formattedContent = content;
  
  // Ensure proper heading hierarchy
  formattedContent = formattedContent.replace(/^#{4,}/gm, '###');
  
  // Enhance bullet points
  formattedContent = formattedContent.replace(/^[-•]\s/gm, '• ');
  
  // Ensure proper spacing around headings
  formattedContent = formattedContent.replace(/^(#{1,3}\s.+)$/gm, '\n$1\n');
  
  // Clean up multiple newlines
  formattedContent = formattedContent.replace(/\n{3,}/g, '\n\n');
  
  // Add analysis type badge
  const typeBadge = getAnalysisTypeBadge(analysisType);
  
  return header + typeBadge + '\n\n' + formattedContent.trim();
}

function getAnalysisTypeBadge(analysisType: string): string {
  const badges = {
    'summary': '📋 **Analysis Type:** Summary',
    'key-takeaways': '💡 **Analysis Type:** Key Takeaways',
    'step-by-step': '📝 **Analysis Type:** Step-by-Step Guide',
    'general-explanation': '🎓 **Analysis Type:** Educational Explanation',
    'tech-review': '🔧 **Analysis Type:** Technical Review',
    'custom': '🎯 **Analysis Type:** Custom Analysis'
  };
  
  return badges[analysisType] || '📊 **Analysis Type:** General Analysis';
}

function extractVideoIdFromUrl(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// Step 6: Enhanced streaming response
function createStreamingResponse(content: string, summary: any, videoMetadata: any) {
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send video metadata first
        const metadataChunk = JSON.stringify({ 
          videoMetadata, 
          summaryId: summary?.id 
        });
        controller.enqueue(new TextEncoder().encode(`data: ${metadataChunk}\n\n`));

        // Stream content in natural chunks
        const sentences = content.split(/(?<=[.!?])\s+/);
        let accumulatedContent = '';

        for (let i = 0; i < sentences.length; i++) {
          accumulatedContent += sentences[i] + ' ';
          
          // Send chunk every few sentences or at natural breaks
          if (i % 3 === 0 || sentences[i].match(/[.!?]$/)) {
            const chunk = JSON.stringify({ 
              content: accumulatedContent,
              videoMetadata,
              summaryId: summary?.id 
            });
            controller.enqueue(new TextEncoder().encode(`data: ${chunk}\n\n`));
            
            // Natural delay for better UX
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        // Send final chunk with any remaining content
        if (accumulatedContent.length < content.length) {
          const finalChunk = JSON.stringify({ 
            content: content,
            videoMetadata,
            summaryId: summary?.id 
          });
          controller.enqueue(new TextEncoder().encode(`data: ${finalChunk}\n\n`));
        }

        controller.close();
      } catch (error) {
        console.error('Streaming error:', error);
        controller.error(error);
      }
    }
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}