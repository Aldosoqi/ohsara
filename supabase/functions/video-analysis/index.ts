import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

interface VideoMetadata {
  title: string;
  duration: string;
  description: string;
  thumbnailUrl?: string;
}

interface QAPair {
  question: string;
  answer: string;
  category: string;
  importance: number;
  timestamp?: string;
  chunkIndex?: number;
}

interface ContentChunk {
  text: string;
  startIndex: number;
  endIndex: number;
  chunkNumber: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// YouTube URL validation regex
const YOUTUBE_URL_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;

// Content length pricing tiers
const CONTENT_PRICING = {
  'micro': 1,    // ≤100 segments
  'short': 2,    // 101-400 segments  
  'medium': 3,   // 401-800 segments
  'long': 4,     // 801-1200 segments
  'extended': 6, // 1201-2000 segments
  'marathon': 8  // >2000 segments
};

function getContentTier(segmentCount: number): string {
  if (segmentCount <= 100) return 'micro';
  if (segmentCount <= 400) return 'short';
  if (segmentCount <= 800) return 'medium';
  if (segmentCount <= 1200) return 'long';
  if (segmentCount <= 2000) return 'extended';
  return 'marathon';
}

function getRequiredCredits(analysisType?: string, segmentCount?: number): number {
  // If analysis type is provided, use that for pricing
  if (analysisType && CONTENT_PRICING[analysisType as keyof typeof CONTENT_PRICING]) {
    return CONTENT_PRICING[analysisType as keyof typeof CONTENT_PRICING];
  }
  
  // Otherwise, determine based on segment count
  if (segmentCount !== undefined) {
    const tier = getContentTier(segmentCount);
    return CONTENT_PRICING[tier as keyof typeof CONTENT_PRICING];
  }
  
  // Default to medium if no info available
  return CONTENT_PRICING.medium;
}

function extractVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_URL_REGEX);
  return match ? match[1] : null;
}

async function getVideoTranscript(videoId: string): Promise<string> {
  try {
    console.log('Fetching transcript for video:', videoId);
    
    // Try multiple transcript APIs as fallback
    const transcriptUrls = [
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
    ];

    for (const url of transcriptUrls) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.text();
          
          if (url.includes('json3')) {
            const jsonData = JSON.parse(data);
            if (jsonData.events) {
              return jsonData.events
                .filter((event: any) => event.segs)
                .map((event: any) => event.segs.map((seg: any) => seg.utf8).join(''))
                .join(' ')
                .replace(/\n/g, ' ')
                .trim();
            }
          } else {
            // Parse SRV3 format
            const textMatches = data.match(/<text[^>]*>(.*?)<\/text>/g);
            if (textMatches) {
              return textMatches
                .map(match => match.replace(/<[^>]*>/g, ''))
                .join(' ')
                .replace(/\n/g, ' ')
                .trim();
            }
          }
        }
      } catch (error) {
        console.log(`Failed to fetch from ${url}:`, error.message);
        continue;
      }
    }

    throw new Error('No transcript available for this video');
  } catch (error) {
    console.error('Error fetching transcript:', error);
    throw error;
  }
}

async function getVideoMetadata(videoId: string): Promise<VideoMetadata> {
  const youtubeApiKey = Deno.env.get('YOUTUBE_API_KEY');
  
  try {
    console.log('Fetching metadata for video:', videoId);
    
    if (!youtubeApiKey) {
      console.log('YouTube API key not available, using fallback metadata');
      return {
        title: 'Video Analysis',
        duration: 'Unknown',
        description: 'Video content analysis'
      };
    }

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${youtubeApiKey}&part=snippet,contentDetails`
    );

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      throw new Error('Video not found');
    }

    const video = data.items[0];
    const snippet = video.snippet;
    const contentDetails = video.contentDetails;

    return {
      title: snippet.title || 'Untitled Video',
      duration: contentDetails.duration || 'Unknown',
      description: snippet.description || '',
      thumbnailUrl: snippet.thumbnails?.default?.url
    };
  } catch (error) {
    console.error('Error fetching video metadata:', error);
    // Return fallback metadata
    return {
      title: 'Video Analysis',
      duration: 'Unknown',
      description: 'Video content analysis'
    };
  }
}

function getSystemPrompt(analysisType: string, isChunked: boolean = false, chunkInfo?: string): string {
  const basePrompt = `You are a video content analysis expert. Your task is to analyze video transcripts and generate helpful Q&A pairs.

${isChunked ? `NOTE: This is part of a larger transcript. ${chunkInfo || ''} Focus on the content in this section while being aware it's part of a larger whole.` : ''}

Return your response as a JSON array of objects with this structure:
{
  "question": "string",
  "answer": "string", 
  "category": "string",
  "importance": number (1-5),
  "timestamp": "MM:SS" (if available)
}`;

  switch (analysisType) {
    case 'comprehensive':
      return `${basePrompt}

Analysis Type: COMPREHENSIVE
- Extract every significant piece of information from this ${isChunked ? 'section' : 'transcript'}
- Cover main topics, subtopics, examples, and details
- Include background context and explanations
- Generate ${isChunked ? '4-8' : '8-15'} Q&A pairs
- Categories: main-topic, detail, example, context, conclusion`;

    case 'key-points':
      return `${basePrompt}

Analysis Type: KEY POINTS
- Focus on the most important and actionable information in this ${isChunked ? 'section' : 'transcript'}
- Prioritize takeaways and practical insights
- Skip minor details and tangents
- Generate ${isChunked ? '3-5' : '5-8'} Q&A pairs
- Categories: key-point, takeaway, action-item, insight`;

    case 'academic':
      return `${basePrompt}

Analysis Type: ACADEMIC
- Extract definitions, theories, and research findings from this ${isChunked ? 'section' : 'transcript'}
- Focus on educational content and learning objectives
- Include methodologies and evidence presented
- Generate ${isChunked ? '3-6' : '6-12'} Q&A pairs
- Categories: definition, theory, research, methodology, evidence`;

    case 'tutorial':
      return `${basePrompt}

Analysis Type: TUTORIAL
- Focus on step-by-step instructions and procedures in this ${isChunked ? 'section' : 'transcript'}
- Extract tools, prerequisites, and requirements
- Include troubleshooting and common mistakes
- Generate ${isChunked ? '3-5' : '6-10'} Q&A pairs
- Categories: step, tool, prerequisite, troubleshooting, tip`;

    default:
      return `${basePrompt}

Analysis Type: STANDARD
- Balance between detail and key points in this ${isChunked ? 'section' : 'transcript'}
- Extract main topics and important details
- Generate ${isChunked ? '3-5' : '6-10'} Q&A pairs
- Categories: main-topic, detail, insight, conclusion`;
  }
}

function createContentChunks(transcript: string, tier: string): ContentChunk[] {
  // Determine chunk size based on content tier
  const chunkSizes = {
    'micro': 15000,     // Single chunk
    'short': 15000,     // Single chunk
    'medium': 12000,    // 2-3 chunks with overlap
    'long': 10000,      // 3-5 chunks with overlap
    'extended': 8000,   // 5-8 chunks with overlap
    'marathon': 6000    // 8+ chunks with overlap
  };

  const chunkSize = chunkSizes[tier as keyof typeof chunkSizes] || 10000;
  const overlapSize = Math.floor(chunkSize * 0.2); // 20% overlap

  // For micro and short content, return single chunk
  if (tier === 'micro' || tier === 'short' || transcript.length <= chunkSize) {
    return [{
      text: transcript,
      startIndex: 0,
      endIndex: transcript.length,
      chunkNumber: 1
    }];
  }

  const chunks: ContentChunk[] = [];
  let startIndex = 0;
  let chunkNumber = 1;

  while (startIndex < transcript.length) {
    let endIndex = Math.min(startIndex + chunkSize, transcript.length);
    
    // Try to end at a sentence boundary if possible
    if (endIndex < transcript.length) {
      const sentenceEnd = transcript.lastIndexOf('.', endIndex);
      const questionEnd = transcript.lastIndexOf('?', endIndex);
      const exclamationEnd = transcript.lastIndexOf('!', endIndex);
      
      const bestEnd = Math.max(sentenceEnd, questionEnd, exclamationEnd);
      if (bestEnd > startIndex + chunkSize * 0.7) {
        endIndex = bestEnd + 1;
      }
    }

    chunks.push({
      text: transcript.substring(startIndex, endIndex),
      startIndex,
      endIndex,
      chunkNumber
    });

    startIndex = endIndex - overlapSize;
    chunkNumber++;
  }

  return chunks;
}

async function processChunk(chunk: ContentChunk, analysisType: string, openaiApiKey: string, totalChunks: number): Promise<QAPair[]> {
  const chunkInfo = totalChunks > 1 ? `This is chunk ${chunk.chunkNumber} of ${totalChunks}.` : '';
  const systemPrompt = getSystemPrompt(analysisType, totalChunks > 1, chunkInfo);
  
  try {
    console.log(`Processing chunk ${chunk.chunkNumber}/${totalChunks}, length: ${chunk.text.length}`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Please analyze this video transcript section and generate Q&A pairs:\n\n${chunk.text}`
          }
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error for chunk ${chunk.chunkNumber}: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    try {
      const qaPairs = JSON.parse(content);
      
      if (Array.isArray(qaPairs)) {
        return qaPairs.map(qa => ({
          question: qa.question || '',
          answer: qa.answer || '',
          category: qa.category || 'general',
          importance: qa.importance || 3,
          timestamp: qa.timestamp || undefined,
          chunkIndex: chunk.chunkNumber
        }));
      }
    } catch (parseError) {
      console.error(`Error parsing chunk ${chunk.chunkNumber} response:`, parseError);
    }

    return [];
  } catch (error) {
    console.error(`Error processing chunk ${chunk.chunkNumber}:`, error);
    return [];
  }
}

function deduplicateAndRankQAPairs(allQAPairs: QAPair[]): QAPair[] {
  // Group similar questions and keep the best ones
  const questionGroups = new Map<string, QAPair[]>();
  
  allQAPairs.forEach(qa => {
    const normalizedQuestion = qa.question.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const key = normalizedQuestion.substring(0, 50); // Use first 50 chars as key
    
    if (!questionGroups.has(key)) {
      questionGroups.set(key, []);
    }
    questionGroups.get(key)!.push(qa);
  });
  
  const deduplicatedPairs: QAPair[] = [];
  
  questionGroups.forEach(group => {
    if (group.length === 1) {
      deduplicatedPairs.push(group[0]);
    } else {
      // Keep the one with highest importance, or most detailed answer
      const best = group.reduce((prev, current) => {
        if (current.importance > prev.importance) return current;
        if (current.importance === prev.importance && current.answer.length > prev.answer.length) return current;
        return prev;
      });
      deduplicatedPairs.push(best);
    }
  });
  
  // Sort by importance (descending) and then by category
  return deduplicatedPairs
    .sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return a.category.localeCompare(b.category);
    })
    .slice(0, 20); // Limit to top 20 Q&A pairs
}

async function generateQAPairs(transcript: string, analysisType: string = 'standard'): Promise<QAPair[]> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    console.log('Generating Q&A pairs with analysis type:', analysisType);
    
    // Determine content tier and create appropriate chunks
    const segmentCount = Math.ceil(transcript.length / 100);
    const tier = getContentTier(segmentCount);
    const chunks = createContentChunks(transcript, tier);
    
    console.log(`Created ${chunks.length} chunks for ${tier} tier content`);
    
    // Process chunks in parallel for better performance
    const chunkPromises = chunks.map(chunk => 
      processChunk(chunk, analysisType, openaiApiKey, chunks.length)
    );
    
    // Wait for all chunks to complete
    const chunkResults = await Promise.all(chunkPromises);
    
    // Flatten and combine all Q&A pairs
    const allQAPairs = chunkResults.flat();
    
    console.log(`Generated ${allQAPairs.length} total Q&A pairs from ${chunks.length} chunks`);
    
    // Deduplicate and rank the results
    const finalQAPairs = deduplicateAndRankQAPairs(allQAPairs);
    
    console.log(`Final result: ${finalQAPairs.length} unique Q&A pairs`);
    
    return finalQAPairs;
  } catch (error) {
    console.error('Error generating Q&A pairs:', error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Parse request body
    const body = await req.json();
    const { videoUrl, analysisType, userId } = body;

    console.log('Received request:', { videoUrl, analysisType, userId });

    // Validate required fields
    if (!videoUrl) {
      return new Response(JSON.stringify({ error: 'videoUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract and validate YouTube video ID
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return new Response(JSON.stringify({ error: 'Invalid YouTube URL provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Extracted video ID:', videoId);

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Handle user authentication and credit management
    if (userId) {
      console.log('Checking credits for user:', userId);

      // Get current user credits
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('user_id', userId)
        .single();

      if (profileError) {
        console.error('Error fetching user profile:', profileError);
        return new Response(JSON.stringify({ error: 'User profile not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const currentCredits = profileData?.credits || 0;
      const requiredCredits = getRequiredCredits(analysisType);

      console.log('Credit check:', { currentCredits, requiredCredits });

      if (currentCredits < requiredCredits) {
        return new Response(JSON.stringify({ 
          error: 'Insufficient credits',
          required: requiredCredits,
          available: currentCredits
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Deduct initial credits (will be adjusted later based on actual content length)
      const { error: deductError } = await supabase.rpc('apply_user_credits', {
        user_id_param: userId,
        credit_amount: -requiredCredits,
        transaction_type_param: 'usage',
        description_param: `Video analysis: ${analysisType || 'standard'}`,
      });

      if (deductError) {
        console.error('Error deducting credits:', deductError);
        return new Response(JSON.stringify({ error: 'Failed to deduct credits' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Credits deducted successfully');
    }

    // Extract video content
    console.log('Starting video content extraction...');
    
    let transcript = '';
    let metadata: VideoMetadata;
    let qaPairs: QAPair[] = [];
    
    try {
      // Get video transcript
      transcript = await getVideoTranscript(videoId);
      console.log('Transcript extracted, length:', transcript.length);
    } catch (error) {
      console.error('Failed to get transcript:', error);
      transcript = 'Transcript not available for this video.';
    }
    
    try {
      // Get video metadata
      metadata = await getVideoMetadata(videoId);
      console.log('Metadata extracted:', metadata.title);
    } catch (error) {
      console.error('Failed to get metadata:', error);
      metadata = {
        title: 'Video Analysis',
        duration: 'Unknown',
        description: 'Video content analysis'
      };
    }

    // Adjust credits based on actual content length if transcript is available
    if (userId && transcript && transcript !== 'Transcript not available for this video.') {
      const segmentCount = Math.ceil(transcript.length / 100); // Approximate segments
      const actualRequiredCredits = getRequiredCredits(analysisType, segmentCount);
      const initialCredits = getRequiredCredits(analysisType);
      
      if (actualRequiredCredits !== initialCredits) {
        const adjustment = actualRequiredCredits - initialCredits;
        console.log('Adjusting credits:', { initial: initialCredits, actual: actualRequiredCredits, adjustment });
        
        if (adjustment !== 0) {
          await supabase.rpc('apply_user_credits', {
            user_id_param: userId,
            credit_amount: -adjustment,
            transaction_type_param: 'usage',
            description_param: `Credit adjustment for video analysis (${getContentTier(segmentCount)})`,
          });
        }
      }
    }

    try {
      // Generate Q&A pairs using AI
      if (transcript && transcript !== 'Transcript not available for this video.') {
        qaPairs = await generateQAPairs(transcript, analysisType || 'standard');
        console.log('Generated Q&A pairs:', qaPairs.length);
      }
    } catch (error) {
      console.error('Failed to generate Q&A pairs:', error);
      qaPairs = [{
        question: 'What is this video about?',
        answer: 'This video analysis could not be completed due to processing limitations.',
        category: 'error',
        importance: 1
      }];
    }

    // Return comprehensive analysis results
    return new Response(JSON.stringify({
      success: true,
      videoId,
      metadata,
      transcript: transcript.substring(0, 5000), // Return first 5000 chars for reference
      qaPairs,
      analysis: {
        type: analysisType || 'standard',
        segmentCount: Math.ceil(transcript.length / 100),
        tier: getContentTier(Math.ceil(transcript.length / 100)),
        creditsUsed: userId ? getRequiredCredits(analysisType, Math.ceil(transcript.length / 100)) : 0,
        chunksProcessed: createContentChunks(transcript, getContentTier(Math.ceil(transcript.length / 100))).length,
        processingMethod: createContentChunks(transcript, getContentTier(Math.ceil(transcript.length / 100))).length > 1 ? 'chunked' : 'single'
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in video-analysis function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
