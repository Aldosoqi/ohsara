import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APIFY_API_KEY = Deno.env.get("APIFY_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

// Helper to get video metadata from YouTube oEmbed
async function getVideoMetadata(url: string) {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const resp = await fetch(oembedUrl);
    if (!resp.ok) throw new Error("oEmbed failed");
    const data = await resp.json();
    return {
      title: data.title || "",
      thumbnail: data.thumbnail_url || "",
      author: data.author_name || "",
    };
  } catch (error) {
    console.error("Failed to get video metadata:", error);
    return { title: "", thumbnail: "", author: "" };
  }
}

// Helper to analyze thumbnail and title with OpenAI Vision
async function analyzeVideoExpectations(title: string, thumbnail: string) {
  if (!OPENAI_API_KEY) return "Unable to analyze - OpenAI API key missing";
  
  try {
    const messages = [
      {
        role: "system",
        content: "You are an expert at understanding what viewers expect from YouTube videos based on thumbnails and titles. Analyze the thumbnail image and title to identify what the viewer is likely expecting to learn, see, or experience from this video. Be specific about the key promises or expectations this video creates."
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Video title: "${title}"\n\nBased on this title and the thumbnail image, what are the main expectations a viewer would have? What are they hoping to learn or see?` },
          { type: "image_url", image_url: { url: thumbnail } }
        ]
      }
    ];

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const error = await resp.text();
      console.error("OpenAI Vision API error:", error);
      return "Unable to analyze expectations";
    }

    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || "No analysis available";
  } catch (error) {
    console.error("Error analyzing expectations:", error);
    return "Analysis failed";
  }
}

// Helper to extract relevant transcript parts based on expectations
async function extractRelevantContent(transcript: string, expectations: string) {
  if (!OPENAI_API_KEY) return transcript.slice(0, 5000); // Fallback: first 5000 chars
  
  try {
    const messages = [
      {
        role: "system",
        content: "You are an expert at extracting the most relevant parts of video transcripts. Given viewer expectations and a full transcript, identify and extract the key segments that directly address what the viewer is expecting. Focus on actionable content, answers to implied questions, and fulfillment of promises made in the title/thumbnail."
      },
      {
        role: "user",
        content: `VIEWER EXPECTATIONS:\n${expectations}\n\nFULL TRANSCRIPT:\n${transcript.slice(0, 50000)}\n\nExtract the most relevant transcript segments that directly address these expectations. Include enough context but focus on the parts that deliver what the viewer came for.`
      }
    ];

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 2000,
        temperature: 0.2,
      }),
    });

    if (!resp.ok) {
      console.error("OpenAI extraction failed");
      return transcript.slice(0, 5000);
    }

    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || transcript.slice(0, 5000);
  } catch (error) {
    console.error("Error extracting relevant content:", error);
    return transcript.slice(0, 5000);
  }
}

serve(async (req) => {
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

    if (!APIFY_API_KEY) {
      return new Response(JSON.stringify({ error: "Server missing APIFY_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("🎬 Getting video metadata...");
    const metadata = await getVideoMetadata(url);

    console.log("📝 Fetching transcript...");
    const endpoint = `https://api.apify.com/v2/acts/pintostudio~youtube-transcript-scraper/run-sync-get-dataset-items?token=${APIFY_API_KEY}`;

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
      return new Response(JSON.stringify({ error: "Failed to get transcript", details: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await apifyResp.json();
    const item = Array.isArray(data) ? data[0] : data;

    let segments: Array<{ start?: string | number; dur?: string | number; text?: string }> = [];

    if (item) {
      if (Array.isArray(item.transcript)) segments = item.transcript;
      else if (Array.isArray(item.transcripts)) segments = item.transcripts;
      else if (Array.isArray(item.items)) segments = item.items;
      else if (Array.isArray(item.segments)) segments = item.segments;
    }

    const fullTranscript = (segments || []).map((s) => s?.text || "").join(" ").trim();

    if (!fullTranscript) {
      return new Response(JSON.stringify({ error: "No transcript found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("🔍 Analyzing viewer expectations...");
    const expectations = await analyzeVideoExpectations(metadata.title, metadata.thumbnail);

    console.log("✂️ Extracting relevant content...");
    const relevantContent = await extractRelevantContent(fullTranscript, expectations);

    return new Response(
      JSON.stringify({
        metadata,
        expectations,
        relevantContent,
        fullTranscript, // Keep full transcript for deeper chat if needed
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("process-TS error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
