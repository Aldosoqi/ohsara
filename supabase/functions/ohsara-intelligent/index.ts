import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const APIFY_API_KEY = Deno.env.get("APIFY_API_KEY");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing Supabase configuration");
}

async function getUserAndClient(req: Request) {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  return { supabase, user };
}

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "");
    }
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const parts = u.pathname.split("/");
    return parts.includes("shorts") ? parts[parts.length - 1] : null;
  } catch {
    return null;
  }
}

async function apifyScrape(youtubeUrl: string) {
  if (!APIFY_API_KEY) throw new Error("APIFY_API_KEY is not configured");
  const startRun = await fetch(`https://api.apify.com/v2/acts/apify~youtube-scraper/runs?token=${APIFY_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startUrls: [{ url: youtubeUrl }],
      maxResults: 1,
      includeTranscript: true,
      addRawCaptions: true,
      proxy: { useApifyProxy: true },
    }),
  });
  const run = await startRun.json();
  const runId = run.data?.id;
  if (!runId) throw new Error("Failed to start Apify run");

  // Poll run status
  for (let i = 0; i < 60; i++) {
    const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`);
    const statusJson = await statusRes.json();
    const status = statusJson.data?.status;
    if (status === "SUCCEEDED") break;
    if (["FAILED", "ABORTING", "ABORTED", "TIMED_OUT"].includes(status)) {
      throw new Error(`Apify run failed: ${status}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Get dataset items
  const datasetUrl = run.data?.defaultDatasetId
    ? `https://api.apify.com/v2/datasets/${run.data.defaultDatasetId}/items?token=${APIFY_API_KEY}`
    : run.data?.itemsUrl;
  const itemsRes = await fetch(datasetUrl);
  const items = await itemsRes.json();
  const item = Array.isArray(items) ? items[0] : items?.items?.[0];
  if (!item) throw new Error("No data returned from Apify");

  // Normalize
  const videoId = extractVideoId(youtubeUrl) || item.id || item.videoId || null;
  const title = item.title || item.videoTitle || "Untitled";
  const thumbnail = item.thumbnail || item.bestThumbnail?.url || (videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : undefined);
  const transcript: string = item.transcriptText || item.transcript || (item.captionsText ?? "");

  return { title, thumbnail, transcript, videoId };
}

async function streamOpenAI(model: string, messages: any[], onChunk: (text: string) => void) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, stream: true }),
  });
  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "");
    throw new Error(`OpenAI error: ${res.status} ${err}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const p of parts) {
      if (!p.startsWith("data: ")) continue;
      const json = p.slice(6).trim();
      if (json === "[DONE]") continue;
      try {
        const parsed = JSON.parse(json);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {}
    }
  }
}

function sseInit(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(`retry: 5000\n`));
    }
  });
}

function sseAppend(controller: ReadableStreamDefaultController, data: any) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { supabase, user } = await getUserAndClient(req);
    const body = await req.json();
    const { youtubeUrl, mode, messages, transcript: providedTranscript } = body;

    if (!youtubeUrl || typeof youtubeUrl !== "string") {
      return new Response(JSON.stringify({ error: "youtubeUrl is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check and deduct credits on start
    if (mode !== "chat") {
      const { data: profile } = await supabase.from("profiles").select("credits").eq("user_id", user.id).single();
      const credits = profile?.credits ?? 0;
      if (credits < 5) {
        return new Response(JSON.stringify({ error: "Insufficient credits (5 required)" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error: debitErr } = await supabase.rpc("update_user_credits", {
        user_id_param: user.id,
        credit_amount: -5,
        transaction_type_param: "ohsara_intelligent_session",
        description_param: "Ohsara Intelligent analysis",
      });
      if (debitErr) throw new Error("Failed to deduct credits");
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (mode === "chat") {
            const transcript = providedTranscript as string;
            if (!transcript) throw new Error("Missing transcript for chat");
            sseAppend(controller, { type: "chat_start" });
            const chatMessages = [
              { role: "system", content: "You are Ohsara Intelligent. Answer strictly based on the provided full YouTube transcript. Be concise, cite timestamps (mm:ss) when relevant, and format clearly with short sections and bullets." },
              { role: "system", content: `Full transcript:\n\n${transcript}` },
              ...(Array.isArray(messages) ? messages : []),
            ];
            await streamOpenAI("gpt-4.1-2025-04-14", chatMessages, (chunk) => {
              sseAppend(controller, { type: "chat_chunk", content: chunk });
            });
            sseAppend(controller, { type: "complete" });
            controller.close();
            return;
          }

          // Start mode: scrape, analyze, map
          sseAppend(controller, { type: "status", message: "Scraping video via Apify..." });
          const scraped = await apifyScrape(youtubeUrl);
          const { title, thumbnail, transcript, videoId } = scraped;
          sseAppend(controller, { type: "metadata", videoMetadata: { title, thumbnail, videoId } });

          // Vision: thumbnail + title analysis (use o4-mini for image understanding)
          sseAppend(controller, { type: "status", message: "Analyzing thumbnail & title with vision..." });
          const visionMessages = [
            { role: "system", content: "You are an expert on YouTube click-through psychology. Analyze the image and title to identify visual hooks, emotions, and clickbait techniques." },
            { role: "user", content: [
              { type: "text", text: `Title: ${title}\nTask: Identify the visual elements in the thumbnail (layout, faces, expressions, text overlays, colors), the title hooks (promises, curiosity gaps), and who is the likely target viewer. Output concise bullet points.` },
              ...(thumbnail ? [{ type: "image_url", image_url: { url: thumbnail } }] : []),
            ]},
          ];
          await streamOpenAI("o4-mini-2025-04-16", visionMessages as any, (chunk) => {
            sseAppend(controller, { type: "vision_chunk", content: chunk });
          });

          // Deep content mapping
          sseAppend(controller, { type: "status", message: "Linking transcript to thumbnail/title..." });
          const mappingPrompt = [
            { role: "system", content: "You map YouTube transcripts to thumbnail/title promises. Return clear, helpful output with timestamps and justification." },
            { role: "user", content: `Title: ${title}\nTranscript (use for evidence with timestamps):\n${transcript}\n\nTask: 1) Key title hooks. 2) Thumbnail elements (inferred from prior vision). 3) For each hook/element, list 2-4 precise transcript moments with timestamps that justify it. 4) Clickbait integrity score (0-100) and explanation. 5) 3 improved title suggestions.` },
          ];
          await streamOpenAI("gpt-4.1-2025-04-14", mappingPrompt, (chunk) => {
            sseAppend(controller, { type: "mapping_chunk", content: chunk });
          });

          // Provide transcript for chat continuity
          sseAppend(controller, { type: "ready_for_chat", transcript });
          sseAppend(controller, { type: "complete" });
          controller.close();
        } catch (err) {
          // Refund on failure during start
          if (mode !== "chat") {
            await supabase.rpc("update_user_credits", {
              user_id_param: user.id,
              credit_amount: 5,
              transaction_type_param: "refund",
              description_param: "Ohsara Intelligent failed - refund",
            }).catch(() => {});
          }
          console.error("ohsara-intelligent error:", err);
          sseAppend(controller, { type: "error", error: (err as Error).message });
          controller.close();
        }
      }
    });

    return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("Fatal error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
