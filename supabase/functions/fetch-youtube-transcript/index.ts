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

    // Check and deduct credits if user is authenticated (initial minimal deduction)
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

      if ((profile.credits as number) < 1) {
        return new Response(JSON.stringify({
          error: "Insufficient credits. Need at least 1 credit for analysis."
        }), {
          status: 402,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }

      // Initial deduction of 1 credit, will adjust based on content length later
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ credits: (profile.credits as number) - 1 })
        .eq('user_id', userId);

      if (updErr) {
        return new Response(JSON.stringify({ error: 'Failed to deduct credits' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

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
        model: 'gpt-5-2025-08-07',
        messages: [
          { 
            role: 'system', 
            content: `You are a multimodal Video Understanding Assistant. Analyze the video's title, thumbnail, and transcript to understand the content and infer user intent. Respond in a structured Q/A format.

${responseLanguage === 'arabic' ? 'Respond entirely in Modern Standard Arabic using س: for questions and ج: for answers.' : 'Respond entirely in English using Q: for questions and A: for answers.'}

Format your response with these sections:
- Start with an italicized intent guess about what the user likely needs
- س: ما هو هذا الفيديو؟ / Q: What is this video about?
- س: من هو الجمهور المستهدف وما المتطلبات المسبقة؟ / Q: Who is it for and what prerequisites are needed?
- س: ما هي الخطوات أو النقاط الرئيسية؟ / Q: What are the key steps/main points? (include timestamps like [12:34])
- س: ما الأدوات/الموارد المذكورة؟ / Q: What tools/resources are mentioned?
- س: ما التحذيرات أو المخاطر؟ / Q: Any caveats, pitfalls, or contradictions?
- End with "الخطوات التالية:" / "Next Steps:" followed by 3-6 actionable bullet points

Be concise, factual, and actionable. Include timestamps when referencing specific content.` 
          },
          { role: 'user', content: userContent }
        ],
        max_completion_tokens: 500,
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
          
          // Determine content length and calculate credit adjustment
          const contentLength = transcript.length;
          let contentCategory = 'micro';
          let requiredCredits = 1;

          if (contentLength > 2000) {
            contentCategory = 'marathon';
            requiredCredits = 8;
          } else if (contentLength > 1200) {
            contentCategory = 'extended';
            requiredCredits = 6;
          } else if (contentLength > 800) {
            contentCategory = 'long';
            requiredCredits = 4;
          } else if (contentLength > 400) {
            contentCategory = 'medium';
            requiredCredits = 3;
          } else if (contentLength > 100) {
            contentCategory = 'short';
            requiredCredits = 2;
          }

          // Adjust credits based on actual content length
          if (userId && creditsDeducted) {
            const additionalCredits = requiredCredits - 1; // We already deducted 1 credit
            if (additionalCredits > 0) {
              // Check if user has enough credits for the adjustment
              const { data: currentProfile } = await supabase
                .from('profiles')
                .select('credits')
                .eq('user_id', userId)
                .single();
              
              if (currentProfile && (currentProfile.credits as number) >= additionalCredits) {
                // Deduct additional credits
                await supabase
                  .from('profiles')
                  .update({ credits: (currentProfile.credits as number) - additionalCredits })
                  .eq('user_id', userId);
                
                // Log the adjustment
                await supabase.from('credit_transactions').insert({
                  user_id: userId,
                  amount: -additionalCredits,
                  transaction_type: 'analysis_adjustment',
                  description: `Content length adjustment (${contentCategory}: ${contentLength} segments)`
                });
              } else {
                // Not enough credits for full analysis, but continue with partial
                console.log(`User ${userId} doesn't have enough credits for ${contentCategory} analysis, continuing with partial`);
              }
            }

            // Log the initial transaction with final details
            await supabase.from('credit_transactions').insert({
              user_id: userId,
              amount: -1,
              transaction_type: 'analysis',
              description: `YouTube analysis (${contentCategory}: ${contentLength} segments)`
            });
          }

          // Send final analysis result
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'analysis_complete', 
            analysis,
            title,
            thumbnail,
            fullTranscript: transcript,
            contentCategory,
            creditsUsed: requiredCredits
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
            .update({ credits: (profileAfter.credits as number) + 1 })
            .eq('user_id', userId);
          await supabase.from('credit_transactions').insert({
            user_id: userId,
            amount: 1,
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
