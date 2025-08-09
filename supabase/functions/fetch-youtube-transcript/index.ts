import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json().catch(() => ({ url: undefined }));
    if (!url) {
      return new Response(JSON.stringify({ error: "Missing 'url' in request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("APIFY_API_KEY") || Deno.env.get("APIFY_API_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "Server missing APIFY_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const endpoint = `https://api.apify.com/v2/acts/pintostudio~youtube-transcript-scraper/run-sync-get-dataset-items?token=${token}`;

    const apifyResp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        videoUrl: url,
        videoUrls: [url],
      }),
    });

    if (!apifyResp.ok) {
      const text = await apifyResp.text();
      console.error("Apify error:", text);
      return new Response(JSON.stringify({ error: "Apify request failed", details: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await apifyResp.json();
    const item = Array.isArray(data) ? data[0] : data;

    let segments: Array<{ start?: string | number; dur?: string | number; text?: string }> = [];
    let chapters: any = null;

    if (item) {
      if (Array.isArray(item.transcript)) segments = item.transcript;
      else if (Array.isArray(item.transcripts)) segments = item.transcripts;
      else if (Array.isArray(item.items)) segments = item.items;
      else if (Array.isArray(item.segments)) segments = item.segments;

      if (Array.isArray(item.chapters)) chapters = item.chapters;
    }

    const transcriptText = (segments || []).map((s) => s?.text || "").join(" ").trim();

    return new Response(
      JSON.stringify({ transcriptText, segments, chapters, raw: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("fetch-youtube-transcript error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: error?.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});