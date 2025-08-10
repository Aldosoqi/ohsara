import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
    const token = Deno.env.get("APIFY_API_TOKEN") || Deno.env.get("APIFY_API_KEY");
    if (!token) {
      return new Response(JSON.stringify({
        error: "Server missing APIFY_API_TOKEN"
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const endpoint = `https://api.apify.com/v2/acts/pintostudio~youtube-transcript-scraper/run-sync-get-dataset-items?token=${token}`;
    const apifyResp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // Provide multiple possible fields to maximize compatibility with the actor
        url,
        videoUrl: url,
        videoUrls: [
          url
        ]
      })
    });
    if (!apifyResp.ok) {
      const text = await apifyResp.text();
      throw new Error(`Apify error: ${text}`);
    }
      const data = await apifyResp.json();
      const item = Array.isArray(data) ? data[0] : data;
      interface Segment { text?: string }
      let segments: Segment[] = [];
      let chapters: unknown = null;
      let title = "";
      let thumbnail_url = "";
      if (item) {
        if (Array.isArray(item.transcript)) segments = item.transcript;
        else if (Array.isArray(item.transcripts)) segments = item.transcripts;
        else if (Array.isArray(item.items)) segments = item.items;
        else if (Array.isArray(item.segments)) segments = item.segments;
        if (Array.isArray(item.chapters)) chapters = item.chapters;
        if (typeof (item as any).title === 'string') title = (item as any).title;
        if (typeof (item as any).videoTitle === 'string') title ||= (item as any).videoTitle;
        if (typeof (item as any).thumbnail === 'string') thumbnail_url = (item as any).thumbnail;
        const thumbs: any[] = (item as any).thumbnails || (item as any).videoThumbnails || [];
        if (Array.isArray(thumbs) && thumbs.length && thumbs[0]?.url) thumbnail_url ||= thumbs[0].url;
      }
      const transcriptText = segments.map((s) => (s?.text ?? "")).join(" ").trim();
      if (!title || !thumbnail_url) {
        try {
          const oembedResp = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
          if (oembedResp.ok) {
            const o = await oembedResp.json();
            if (typeof o?.title === 'string') title ||= o.title;
            if (typeof o?.thumbnail_url === 'string') thumbnail_url ||= o.thumbnail_url;
          }
        } catch (_) { /* noop */ }
      }
    return new Response(JSON.stringify({
      title,
      thumbnail_url,
      transcriptText,
      segments,
      chapters,
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
      details: (error as Error).message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
