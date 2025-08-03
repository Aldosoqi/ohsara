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

    console.log(`Processing YouTube URL: ${youtubeUrl} for user: ${user.id}`);

    // Step 1: Extract video ID from URL
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // Step 2: Check and deduct credits
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.credits < 1) {
      throw new Error('Insufficient credits');
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

    // Step 3: Scrape transcript using Apify
    console.log('Starting transcript extraction for video ID:', videoId);
    const transcript = await scrapeTranscript(videoId);

    if (!transcript) {
      console.log('No transcript found, refunding credit...');
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

    // Step 4: Get video metadata
    const videoMetadata = await getVideoMetadata(videoId);

    // Step 5: Process transcript (with chunking for long content)
    console.log('Starting AI analysis...');
    console.log('Transcript length:', transcript.length, 'characters');
    
    // GPT-4.1 has much larger context window (1M+ tokens), so we can handle much larger transcripts
    const maxDirectProcessingSize = 800000; // Characters - GPT-4.1 can handle ~1M tokens (roughly 800k chars)
    let analysisResult = '';
    
    if (transcript.length <= maxDirectProcessingSize) {
      // Process directly with GPT-4.1 - no chunking needed for most videos
      const analysisPrompt = buildAnalysisPrompt(analysisType, customRequest, transcript);
      
      const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
              content: 'You are an expert video content analyzer. Provide detailed, well-structured analysis based on the user\'s requirements.'
            },
            {
              role: 'user',
              content: analysisPrompt
            }
          ],
          stream: true,
          temperature: 0.7,
          max_tokens: 16000
        }),
      });

      if (!openAIResponse.ok) {
        const errorText = await openAIResponse.text();
        console.error('OpenAI API error:', errorText);
        throw new Error(`Failed to analyze content: ${errorText}`);
      }

      // Step 6: Save summary to database
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
        console.error('Failed to save summary:', summaryError);
      }

      // Return streaming response
      return createStreamingResponse(openAIResponse, summary, videoMetadata, supabase);
    } else {
      // Very long transcript - use optimized chunking with GPT-4.1
      console.log('Very long transcript detected, using optimized chunking approach...');
      return await processLongTranscript(transcript, analysisType, customRequest, videoMetadata, user, youtubeUrl, supabase);
    }

  } catch (error) {
    console.error('Error in process-youtube function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processLongTranscript(
  transcript: string, 
  analysisType: string, 
  customRequest: string, 
  videoMetadata: any, 
  user: any, 
  youtubeUrl: string, 
  supabase: any
) {
  console.log('Processing very long transcript with optimized chunking...');
  
  // GPT-4-turbo can handle much larger chunks, so we use fewer, larger chunks
  const maxChunkSize = 300000; // Much larger chunks due to GPT-4-turbo's huge context window
  const chunks = splitTranscriptIntoChunks(transcript, maxChunkSize);
  console.log(`Split transcript into ${chunks.length} chunks`);
  
  let combinedAnalysis = '';
  let chunkAnalyses: string[] = [];
  
  // Process each chunk with minimal delay due to higher rate limits
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i + 1}/${chunks.length}...`);
    
    const chunkPrompt = buildChunkAnalysisPrompt(analysisType, customRequest, chunks[i], i + 1, chunks.length);
    
    // GPT-4-turbo has higher rate limits, so minimal delay needed
    if (i > 0) {
      console.log('Waiting 1 second between requests...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const chunkAnalysis = await processChunkWithRetry(chunkPrompt, i + 1);
    if (chunkAnalysis) {
      chunkAnalyses.push(chunkAnalysis);
      console.log(`Chunk ${i + 1} processed successfully`);
    } else {
      console.error(`Failed to process chunk ${i + 1} after retries`);
      chunkAnalyses.push(`[Error processing chunk ${i + 1}]`);
    }
  }
  
  // Check if we have any successful chunk analyses
  if (chunkAnalyses.length === 0) {
    throw new Error('Failed to process any chunks of the transcript');
  }
  
  console.log(`Successfully processed ${chunkAnalyses.length} chunks, combining results...`);
  
  // Combine all chunk analyses
  const finalPrompt = buildFinalCombinationPrompt(analysisType, customRequest, chunkAnalyses);
  
  const finalResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + geminiApiKey, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `You are an expert video content analyzer. Combine and synthesize the chunk analyses into a comprehensive final analysis.\n\n${finalPrompt}`
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 20000
      }
    }),
  });
  
  if (!finalResponse.ok) {
    const errorText = await finalResponse.text();
    console.error('OpenAI API error for final analysis:', errorText);
    throw new Error(`Failed to analyze content: ${errorText}`);
  }
  
  // Save summary to database
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
    console.error('Failed to save summary:', summaryError);
  }
  
  return createStreamingResponse(finalResponse, summary, videoMetadata, supabase, true);
}

async function processChunkWithRetry(chunkPrompt: string, chunkNumber: number, maxRetries: number = 3): Promise<string | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting to process chunk ${chunkNumber}, attempt ${attempt}/${maxRetries}`);
      
      const chunkResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + geminiApiKey, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are an expert video content analyzer. Analyze this chunk of content and provide detailed insights.\n\n${chunkPrompt}`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4000
          }
        }),
      });

      if (chunkResponse.ok) {
        const chunkData = await chunkResponse.json();
        const chunkAnalysis = chunkData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return chunkAnalysis;
      } else {
        const errorText = await chunkResponse.text();
        console.error(`Chunk ${chunkNumber} attempt ${attempt} failed:`, errorText);
        
        // Check if it's a rate limit error
        if (errorText.includes('rate_limit_exceeded') && attempt < maxRetries) {
          const waitTime = Math.min(20000, 3000 * attempt); // Shorter waits due to higher GPT-4-turbo rate limits
          console.log(`Rate limit hit, waiting ${waitTime/1000} seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        
        // For other errors or final attempt, return null
        if (attempt === maxRetries) {
          return null;
        }
      }
    } catch (error) {
      console.error(`Chunk ${chunkNumber} attempt ${attempt} error:`, error);
      if (attempt === maxRetries) {
        return null;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  return null;
}

function createStreamingResponse(apiResponse: Response, summary: any, videoMetadata: any, supabase: any, isGemini: boolean = false) {
  const stream = new ReadableStream({
    async start(controller) {
      const reader = apiResponse.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      let fullContent = '';
      let streamClosed = false;
      const decoder = new TextDecoder();

      const closeStream = async () => {
        if (streamClosed) return;
        streamClosed = true;
        
        try {
          // Update summary with final content
          if (summary && fullContent) {
            await supabase
              .from('summaries')
              .update({ summary: fullContent })
              .eq('id', summary.id);
          }
          controller.close();
        } catch (error) {
          console.error('Error closing stream:', error);
          if (!streamClosed) {
            controller.error(error);
          }
        }
      };

      try {
        if (isGemini) {
          // For Gemini, we get a single response, not streaming
          const geminiData = await apiResponse.json();
          const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          fullContent = content;
          
          // Send the content in chunks to simulate streaming
          const chunkSize = 50;
          for (let i = 0; i < content.length; i += chunkSize) {
            const chunk = content.slice(i, i + chunkSize);
            if (!streamClosed) {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ content: chunk, videoMetadata, summaryId: summary?.id })}\n\n`));
            }
            // Small delay to simulate streaming
            await new Promise(resolve => setTimeout(resolve, 10));
          }
          
          await closeStream();
        } else {
          // Original OpenAI streaming logic
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              await closeStream();
              break;
            }

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  await closeStream();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content && !streamClosed) {
                    fullContent += content;
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ content, videoMetadata, summaryId: summary?.id })}\n\n`));
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Streaming error:', error);
        if (!streamClosed) {
          streamClosed = true;
          controller.error(error);
        }
      } finally {
        try {
          await reader.releaseLock();
        } catch (e) {
          // Reader might already be released
        }
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

function splitTranscriptIntoChunks(transcript: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  const sentences = transcript.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const potentialChunk = currentChunk + sentence + '. ';
    
    if (potentialChunk.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence + '. ';
    } else {
      currentChunk = potentialChunk;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

function buildChunkAnalysisPrompt(analysisType: string, customRequest: string, chunk: string, chunkNumber: number, totalChunks: number): string {
  const basePrompt = `Analyze this section (part ${chunkNumber} of ${totalChunks}) of a video transcript:\n\n${chunk}\n\n`;
  
  switch (analysisType) {
    case 'summary':
      return basePrompt + 'Extract the key points and main ideas from this section. Focus on the most important information.';
    
    case 'key-takeaways':
      return basePrompt + 'Identify any important takeaways, insights, or lessons from this section.';
    
    case 'step-by-step':
      return basePrompt + 'Identify any steps, processes, or methodologies mentioned in this section.';
    
    case 'general-explanation':
      return basePrompt + 'Explain the main concepts and topics discussed in this section.';
    
    case 'tech-review':
      return basePrompt + 'Provide technical analysis for this section, including details, pros/cons, and insights.';
    
    case 'custom':
      return basePrompt + `Focus on this specific request: "${customRequest}". Extract any information from this section that relates to this request.`;
    
    default:
      return basePrompt + 'Analyze the main content and themes in this section.';
  }
}

function buildFinalCombinationPrompt(analysisType: string, customRequest: string, chunkAnalyses: string[]): string {
  const combinedAnalyses = chunkAnalyses.map((analysis, index) => 
    `--- Section ${index + 1} Analysis ---\n${analysis}\n`
  ).join('\n');
  
  const basePrompt = `I have analyzed a long video transcript in sections. Here are the individual section analyses:\n\n${combinedAnalyses}\n\n`;
  
  switch (analysisType) {
    case 'summary':
      return basePrompt + 'Please combine these section analyses into a comprehensive, well-structured summary of the entire video. Organize the content logically and highlight the most important points.';
    
    case 'key-takeaways':
      return basePrompt + 'Please combine these section analyses and extract the most important key takeaways and insights from the entire video. Present them as a clear, organized list.';
    
    case 'step-by-step':
      return basePrompt + 'Please combine these section analyses and create a comprehensive step-by-step breakdown of all processes and methodologies mentioned throughout the video.';
    
    case 'general-explanation':
      return basePrompt + 'Please combine these section analyses into a clear, comprehensive explanation of all concepts and topics discussed in the video.';
    
    case 'tech-review':
      return basePrompt + 'Please combine these section analyses into a comprehensive technical review of the entire video content, including all technical details, pros/cons, and expert insights.';
    
    case 'custom':
      return basePrompt + `Please combine these section analyses to provide a comprehensive response to this specific request: "${customRequest}". Focus on synthesizing all relevant information from across the video to address what was asked for.`;
    
    default:
      return basePrompt + 'Please combine these section analyses into a comprehensive analysis of the entire video content.';
  }
}

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function scrapeTranscript(videoId: string): Promise<string | null> {
  try {
    console.log('Calling Apify API for video ID:', videoId);
    const apifyUrl = `https://api.apify.com/v2/acts/pintostudio~youtube-transcript-scraper/run-sync-get-dataset-items?token=${apifyApiKey}`;
    
    const requestBody = {
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`
    };
    
    console.log('Apify request body:', JSON.stringify(requestBody));
    
    const response = await fetch(apifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Apify response status:', response.status);
    console.log('Apify response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Apify API error details:', errorText);
      return null;
    }

    const data = await response.json();
    console.log('Full Apify response data:', JSON.stringify(data, null, 2));
    
    if (!data || data.length === 0) {
      console.log('Empty data array returned from Apify for video:', videoId);
      return null;
    }

    const firstItem = data[0];
    console.log('First item structure:', Object.keys(firstItem || {}));
    console.log('First item data:', JSON.stringify(firstItem, null, 2));

    const transcriptData = firstItem?.data;
    if (!transcriptData || !Array.isArray(transcriptData)) {
      console.log('No transcript data array found in response');
      return null;
    }

    // Filter out items without text and extract text content
    const textItems = transcriptData.filter(item => item?.text);
    
    if (textItems.length === 0) {
      console.log('No text items found in transcript data');
      return null;
    }

    // Join all text segments
    const joinedTranscript = textItems.map(item => item.text).join(' ');
    
    console.log('Extracted transcript length:', joinedTranscript.length);
    console.log('First 200 characters:', joinedTranscript.substring(0, 200));
    
    return joinedTranscript;

    console.log('Transcript is neither string nor array:', typeof transcript);
    return null;
  } catch (error) {
    console.error('Error scraping transcript:', error);
    return null;
  }
}

async function getVideoMetadata(videoId: string) {
  try {
    // Use oEmbed API to get real YouTube metadata
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    
    const response = await fetch(oEmbedUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch metadata');
    }
    
    const data = await response.json();
    
    return {
      title: data.title || 'Unknown Title',
      description: data.author_name || '',
      thumbnail: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration: 0
    };
  } catch (error) {
    console.error('Error getting video metadata:', error);
    return {
      title: 'Unknown Title',
      description: '',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration: 0
    };
  }
}

function buildAnalysisPrompt(analysisType: string, customRequest: string, transcript: string): string {
  const basePrompt = `Please analyze the following video transcript:\n\n${transcript}\n\n`;
  
  switch (analysisType) {
    case 'summary':
      return basePrompt + 'Provide a comprehensive summary of the main points and key information covered in this video.';
    
    case 'key-takeaways':
      return basePrompt + 'Extract and list the most important key takeaways and insights from this video.';
    
    case 'step-by-step':
      return basePrompt + 'Break down all the steps, processes, or methodologies mentioned in this video in a detailed, sequential manner.';
    
    case 'general-explanation':
      return basePrompt + 'Provide a clear, simple explanation of the concepts and topics discussed in this video.';
    
    case 'tech-review':
      return basePrompt + 'Provide a technical analysis and review of the content, including technical details, pros/cons, and expert insights.';
    
    case 'custom':
      return basePrompt + `I need you to focus specifically on: "${customRequest}". 

Please provide a detailed, focused analysis that directly addresses this request. Structure your response clearly and provide specific examples, quotes, or details from the transcript that relate to what I'm asking for. If the transcript doesn't contain information about my specific request, please clearly state that and suggest what related information is available instead.`;
    
    default:
      return basePrompt + 'Provide a comprehensive analysis of this video content.';
  }
}