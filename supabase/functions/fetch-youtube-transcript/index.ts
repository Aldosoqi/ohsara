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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let userId = null;
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id;
    }

    // Check credits if user is authenticated
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits')
        .eq('user_id', userId)
        .single();

      if (!profile || profile.credits < 4) {
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
    }

    const apifyToken = "apify_api_ja0f7NdWfQvdRaWbP3Ts0Arnbn2n6c2zR7DI";
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
    const item = Array.isArray(data) ? data[0] : data;
    
    if (!item) {
      throw new Error("No data returned from Apify");
    }

    // Extract transcript with timestamps (handle different shapes)
    const transcript = Array.isArray(item?.data)
      ? item.data
      : (Array.isArray(item?.transcript) ? item.transcript : []);

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
    const extractPrompt = `Based on this analysis of user expectations: "${analysis}"

Extract the most relevant parts from this transcript that directly address what the user is expecting. Include the timestamp for each relevant segment:

${transcript.map(t => `[${t.start}s] ${t.text || ''}`).join('\n')}

Return only the segments that contain the key information the user is seeking, maintaining the timestamp format.`;

    const extractResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert at extracting relevant information from transcripts.' },
          { role: 'user', content: extractPrompt }
        ],
        max_tokens: 1000
      }),
    });

    const extractData = await extractResp.json();
    const extractedContent = extractData.choices[0].message.content;

    // Deduct credits and save history if user is authenticated
    let remainingCredits: number | null = null;
    if (userId) {
      // 1) Save to history (summaries)
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

      // 2) Deduct credits
      try {
        await supabase.rpc('update_user_credits', {
          user_id_param: userId,
          credit_amount: -4,
          transaction_type_param: 'analysis',
          description_param: 'YouTube title & thumbnail recognition'
        });
        const { data: profileAfter } = await supabase
          .from('profiles')
          .select('credits')
          .eq('user_id', userId)
          .maybeSingle();
        remainingCredits = (profileAfter as any)?.credits ?? null;
      } catch (e) {
        console.error('Failed to deduct credits:', e);
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
