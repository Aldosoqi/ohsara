import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const apifyApiKey = Deno.env.get('APIFY_API_KEY');
const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Extract video metadata from YouTube URL
async function getVideoMetadata(youtubeUrl: string) {
  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  return {
    title: "Video Title", // Will be updated when we get transcript data
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    videoId
  };
}

function extractVideoId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// Extract transcript using Apify
async function extractTranscript(youtubeUrl: string) {
  if (!apifyApiKey) {
    throw new Error('APIFY_API_KEY is not configured');
  }

  console.log('Starting transcript extraction for:', youtubeUrl);

  try {
    // Run the Apify YouTube scraper
    const runResponse = await fetch(`https://api.apify.com/v2/acts/apify~youtube-scraper/runs?token=${apifyApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startUrls: [{ url: youtubeUrl }],
        resultsType: 'videos',
        searchKeywords: '',
        searchSortBy: 'relevance',
        maxResults: 1,
        subtitlesFormat: 'text',
        subtitlesLangs: ['en'],
        verboseLog: false
      }),
    });

    if (!runResponse.ok) {
      throw new Error(`Apify API error: ${runResponse.status}`);
    }

    const runData = await runResponse.json();
    const runId = runData.data.id;

    console.log('Apify run started:', runId);

    // Wait for the run to complete
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apifyApiKey}`);
      const statusData = await statusResponse.json();
      
      console.log('Run status:', statusData.data.status);
      
      if (statusData.data.status === 'SUCCEEDED') {
        // Get the results
        const resultsResponse = await fetch(`https://api.apify.com/v2/datasets/${statusData.data.defaultDatasetId}/items?token=${apifyApiKey}`);
        const results = await resultsResponse.json();
        
        console.log('Results received:', results.length, 'items');
        
        if (results.length > 0 && results[0].subtitles) {
          console.log('Transcript found successfully');
          return {
            transcript: results[0].subtitles,
            title: results[0].title || 'Video Title',
            description: results[0].description || ''
          };
        } else {
          console.log('No subtitles found in results');
          throw new Error('No transcript or captions available for this video');
        }
      } else if (statusData.data.status === 'FAILED') {
        throw new Error('Transcript extraction failed');
      }
      
      attempts++;
    }
    
    throw new Error('Transcript extraction timed out');
  } catch (error) {
    console.error('Transcript extraction error:', error);
    throw error;
  }
}

// Process transcript with GPT-4o
async function processTranscriptWithGPT(transcript: string, userRequest: string) {
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  console.log('Processing transcript with GPT-4o');

  const prompt = `You are an expert content analyzer. A user has provided a YouTube video transcript and wants specific information extracted from it.

User Request: "${userRequest}"

Video Transcript:
${transcript}

Instructions:
1. Carefully analyze the transcript to understand the content
2. Extract and provide exactly what the user requested
3. Format your response in a clear, readable manner with proper headings and structure
4. Use bullet points, numbered lists, and paragraphs as appropriate
5. If the user's request cannot be fully answered from the transcript, explain what information is available
6. Make the response comprehensive but focused on the user's specific needs

Please provide a well-formatted response that directly addresses the user's request:`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert content analyst who provides clear, well-structured responses based on video transcripts. Always format your responses with proper headings, bullet points, and clear organization for easy reading.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 4000,
      temperature: 0.3,
      stream: true
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'OpenAI API error' }));
    throw new Error(`OpenAI API error: ${errorData.error?.message || response.status}`);
  }

  return response;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { youtubeUrl, userRequest } = await req.json();
    
    console.log('Processing video:', youtubeUrl);
    console.log('User request:', userRequest);

    if (!youtubeUrl || !userRequest) {
      throw new Error('Missing youtubeUrl or userRequest');
    }

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

    // Check and deduct credits
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

    // Get video metadata
    const videoMetadata = await getVideoMetadata(youtubeUrl);
    
    // Create a readable stream for Server-Sent Events
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        
        // Send initial video metadata
        const metadataChunk = `data: ${JSON.stringify({ videoMetadata })}\n\n`;
        controller.enqueue(encoder.encode(metadataChunk));
        
        // Extract transcript and process with GPT-4o
        (async () => {
          try {
            // Extract transcript
            const transcriptData = await extractTranscript(youtubeUrl);
            
            // Update video metadata with actual title from transcript data
            const updatedMetadata = {
              ...videoMetadata,
              title: transcriptData.title || videoMetadata.title || 'YouTube Video'
            };
            
            const updatedMetadataChunk = `data: ${JSON.stringify({ videoMetadata: updatedMetadata })}\n\n`;
            controller.enqueue(encoder.encode(updatedMetadataChunk));
            
            // Create a summary record in the database
            const { data: summaryRecord, error: insertError } = await supabase
              .from('summaries')
              .insert({
                user_id: user.id,
                youtube_url: youtubeUrl,
                video_title: updatedMetadata.title,
                thumbnail_url: updatedMetadata.thumbnail,
                video_description: transcriptData.description,
                summary: '' // Will be updated as we process
              })
              .select()
              .single();

            if (insertError) {
              throw new Error('Failed to create summary record');
            }

            // Process with GPT-4o (streaming)
            const gptResponse = await processTranscriptWithGPT(transcriptData.transcript, userRequest);
            const reader = gptResponse.body?.getReader();
            
            if (!reader) {
              throw new Error('No readable stream from OpenAI');
            }

            const decoder = new TextDecoder();
            let completeResponse = '';
            
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value);
              const lines = chunk.split('\n');
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6);
                  if (data === '[DONE]') continue;
                  
                  try {
                    const parsed = JSON.parse(data);
                    const content = parsed.choices?.[0]?.delta?.content;
                    
                    if (content) {
                      completeResponse += content;
                      const contentChunk = `data: ${JSON.stringify({ content })}\n\n`;
                      controller.enqueue(encoder.encode(contentChunk));
                    }
                  } catch (e) {
                    // Skip invalid JSON
                  }
                }
              }
            }

            // Update the summary with the complete response
            await supabase
              .from('summaries')
              .update({
                summary: completeResponse,
                updated_at: new Date().toISOString()
              })
              .eq('id', summaryRecord.id);

            // Send completion signal
            const completionChunk = `data: ${JSON.stringify({ completed: true })}\n\n`;
            controller.enqueue(encoder.encode(completionChunk));
            
            controller.close();
          } catch (error) {
            console.error('Processing error:', error);
            
            // Refund credit on error
            try {
              await supabase.rpc('update_user_credits', {
                user_id_param: user.id,
                credit_amount: 1,
                transaction_type_param: 'refund',
                description_param: 'Processing failed - refunded'
              });
            } catch (refundError) {
              console.error('Failed to refund credit:', refundError);
            }
            
            const errorChunk = `data: ${JSON.stringify({ error: error.message })}\n\n`;
            controller.enqueue(encoder.encode(errorChunk));
            controller.close();
          }
        })();
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

  } catch (error) {
    console.error('Error in process-youtube function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});