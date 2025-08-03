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

    // Step 5: Analyze transcript with OpenAI (streaming)
    console.log('Starting AI analysis...');
    const analysisPrompt = buildAnalysisPrompt(analysisType, customRequest, transcript);
    
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
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
        max_tokens: 4000
      }),
    });

    if (!openAIResponse.ok) {
      throw new Error('Failed to analyze content');
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
    const stream = new ReadableStream({
      async start(controller) {
        const reader = openAIResponse.body?.getReader();
        if (!reader) return;

        let fullContent = '';
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  // Update summary with final content
                  if (summary && fullContent) {
                    await supabase
                      .from('summaries')
                      .update({ summary: fullContent })
                      .eq('id', summary.id);
                  }
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    fullContent += content;
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ content, videoMetadata, summaryId: summary?.id })}\n\n`));
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
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

  } catch (error) {
    console.error('Error in process-youtube function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

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
      return basePrompt + `Based on this specific request: "${customRequest}", please analyze the content accordingly.`;
    
    default:
      return basePrompt + 'Provide a comprehensive analysis of this video content.';
  }
}