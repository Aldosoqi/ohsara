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
    const { url } = await req.json().catch(() => ({
      url: undefined
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
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('credits')
        .eq('user_id', userId)
        .single();

      if (profileErr || !profile) {
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
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert at analyzing video content and user expectations.' },
          { role: 'user', content: userContent }
        ],
        max_tokens: 500
      }),
    });

    const openAIData = await openAIResp.json();
    const analysis = openAIData.choices[0].message.content;

    // Extract relevant transcript parts with timestamps
    const extractPrompt = `Viewer intent (from title/thumbnail analysis): "${analysis}"

Using the transcript below (each line has a start timestamp in seconds), produce a well-structured Markdown answer with clear H1/H2/H3 headings. For each key point, include a bullet with the exact timestamp in [mm:ss] (or [hh:mm:ss]) format that the information appears. Do not invent timestamps; only use ones from the transcript. Keep the response left-to-right.

Transcript:
${transcriptForPrompt.map(t => `[${t.start}s] ${t.text || ''}`).join('\n')}`;

    const extractResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert at extracting relevant information from transcripts and providing concise answers to viewer expectations.' },
          { role: 'user', content: extractPrompt }
        ],
        max_tokens: 1000
      }),
    });

    const extractData = await extractResp.json();
    const extractedContent = extractData.choices[0].message.content;

    // Save history and fetch remaining credits if user is authenticated
    let remainingCredits: number | null = null;
    if (userId) {
      try {
        await supabase.from('summaries').insert({
          user_id: userId,
          youtube_url: url,
          video_title: title || null,
          thumbnail_url: thumbnail || null,
          summary: extractedContent || analysis || ''
        });
      } catch (e) {
        console.error('Failed to insert summary history:', e);
      }

      try {
        const { data: profileAfter } = await supabase
          .from('profiles')
          .select('credits')
          .eq('user_id', userId)
          .maybeSingle<{ credits: number }>();
        remainingCredits = profileAfter?.credits ?? null;
      } catch (e) {
        console.error('Failed to fetch remaining credits:', e);
      }
    }

    return new Response(JSON.stringify({
      title,
      thumbnail,
      analysis,
      extractedContent,
      fullTranscript: transcript,
      creditsDeducted: userId ? 4 : 0,
      remainingCredits,
      raw: data
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });

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

    return new Response(JSON.stringify({
      error: "Unexpected error",
      details: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
