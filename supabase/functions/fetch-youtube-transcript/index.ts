import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  let userId: string | null = null;
  let creditsDeducted = false;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { url, responseLanguage } = await req.json().catch(() => ({
      url: undefined,
      responseLanguage: 'automatic'
    }));

    if (!url) {
      return new Response(JSON.stringify({
        error: "Missing 'url' in request body"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // Get auth user
    const authHeader = req.headers.get('Authorization');

    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id || null;
    }

    // Check and deduct credits if user is authenticated
    if (userId) {
      // Ensure profile exists; grant default credits (5) to brand new users
      let { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('credits')
        .eq('user_id', userId)
        .maybeSingle();

      if (!profile) {
        // Insert minimal profile row; credits default is 5 per DB default
        await supabase.from('profiles').insert({ user_id: userId }).catch(() => {});
        const { data: prof } = await supabase
          .from('profiles')
          .select('credits')
          .eq('user_id', userId)
          .single();
        profile = prof as any;
      }

      if (!profile) {
        return new Response(JSON.stringify({ error: "Profile not found" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if ((profile.credits as number) < 4) {
        return new Response(JSON.stringify({
          error: "Insufficient credits. Need 4 credits for analysis."
        }), {
          status: 402,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }

      const { error: updErr } = await supabase
        .from('profiles')
        .update({ credits: (profile.credits as number) - 4 })
        .eq('user_id', userId);

      if (updErr) {
        return new Response(JSON.stringify({ error: 'Failed to deduct credits' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // best-effort transaction log
      await supabase.from('credit_transactions').insert({
        user_id: userId,
        amount: -4,
        transaction_type: 'analysis',
        description: 'YouTube title & thumbnail recognition'
      });

      creditsDeducted = true;
    }

    // Create analysis job row to allow resuming after navigation
    let jobId: string | null = null;
    if (userId) {
      try {
        const { data: job } = await supabase
          .from('video_analyses')
          .insert({ user_id: userId, youtube_url: url, status: 'processing' })
          .select('id')
          .single();
        jobId = job?.id ?? null;
      } catch (_) {}
    }

    const apifyToken = Deno.env.get('APIFY_API_TOKEN') || Deno.env.get('APIFY_API_KEY');
    if (!apifyToken) {
      throw new Error('Missing Apify API token. Set APIFY_API_TOKEN or APIFY_API_KEY in Supabase Function Secrets.');
    }
    const endpoint = `https://api.apify.com/v2/acts/pintostudio~youtube-transcript-scraper/run-sync-get-dataset-items?token=${apifyToken}`;
    
    const apifyResp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        videoUrl: url
      })
    });

    if (!apifyResp.ok) {
      const text = await apifyResp.text();
      throw new Error(`Apify error: ${text}`);
    }

    const data = await apifyResp.json();

    // Apify may return either the transcript array directly, or an object/array containing it
    let transcript: Array<{ start: string; dur?: string; text?: string }> = [];
    if (Array.isArray(data)) {
      if (data.length && (typeof data[0]?.start !== 'undefined' || typeof data[0]?.text !== 'undefined')) {
        transcript = data as typeof transcript;
      } else if (data[0]?.data && Array.isArray(data[0].data)) {
        transcript = data[0].data;
      } else if (data[0]?.transcript && Array.isArray(data[0].transcript)) {
        transcript = data[0].transcript;
      }
    } else if (data?.data && Array.isArray(data.data)) {
      transcript = data.data;
    } else if (data?.transcript && Array.isArray(data.transcript)) {
      transcript = data.transcript;
    }

    if (!transcript || !Array.isArray(transcript) || transcript.length === 0) {
      throw new Error("No transcript returned from Apify");
    }

    // Try to get title/thumbnail from response, otherwise fallback later
    const item = Array.isArray(data) ? data[0] : data;

    // Limit transcript length for prompt to avoid token overflows
    const MAX_LINES = 800;
    const transcriptForPrompt = transcript.slice(0, MAX_LINES);
    // Try to get title/thumbnail from Apify first
    let title: string = item?.title || "";
    let thumbnail: string = item?.thumbnail || item?.thumbnailUrl || "";

    // Fallback to YouTube oEmbed if missing
    if ((!title || !thumbnail) && url) {
      try {
        const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (oembed.ok) {
          const o = await oembed.json();
          title = title || o?.title || "";
          thumbnail = thumbnail || o?.thumbnail_url || "";
        }
      } catch (_) {
        // ignore oEmbed failure, keep defaults
      }
    }

    // Analyze with OpenAI
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error("Missing OpenAI API key");
    }

    // Language preference handling
    const languageInstruction = (responseLanguage && responseLanguage !== 'automatic') ? `Please respond in ${responseLanguage}.` : '';

    // Build multimodal user content including thumbnail image
    const userContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
      { type: 'text', text: 'Analyze this YouTube video title and thumbnail. Extract keywords from the title and describe notable visual properties on the thumbnail to infer what the viewer expects from this video.' },
      { type: 'text', text: `Title: "${title}"` },
    ];
    if (thumbnail) {
      userContent.push({ type: 'image_url', image_url: { url: thumbnail } });
    }

    const openAIResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          { role: 'system', content: `You are an expert at analyzing video content and user expectations.${languageInstruction ? ' ' + languageInstruction : ''}` },
          { role: 'user', content: userContent }
        ],
        max_tokens: 500,
        stream: true
      }),
    });

    // Stream the analysis response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = openAIResp.body?.getReader();
          if (!reader) throw new Error("No response stream");
          
          let analysis = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                
                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    analysis += content;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'analysis_chunk', content })}\n\n`));
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
          
          // Send final analysis result
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'analysis_complete', 
            analysis,
            title,
            thumbnail,
            fullTranscript: transcript
          })}\n\n`));
          
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

    // The streaming response is already handled above

  } catch (error) {
    console.error("fetch-youtube-transcript error:", error);

    if (creditsDeducted && userId) {
      try {
        const { data: profileAfter, error: profErr } = await supabase
          .from('profiles')
          .select('credits')
          .eq('user_id', userId)
          .single();
        if (!profErr && profileAfter) {
          await supabase
            .from('profiles')
            .update({ credits: (profileAfter.credits as number) + 4 })
            .eq('user_id', userId);
          await supabase.from('credit_transactions').insert({
            user_id: userId,
            amount: 4,
            transaction_type: 'refund',
            description: 'Analysis failed - refund'
          });
        }
      } catch (refundError) {
        console.error('Failed to refund credits:', refundError);
      }
    }
    // Mark job as failed if it was created
    try {
      // @ts-ignore
      if (typeof jobId !== 'undefined' && jobId) {
        await supabase
          .from('video_analyses')
          .update({ status: 'failed', error: (error as any)?.message || 'failed' })
          .eq('id', jobId);
      }
    } catch (_) {}

    return new Response(JSON.stringify({
      error: "Unexpected error",
      details: (error as any)?.message || 'Unknown error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
