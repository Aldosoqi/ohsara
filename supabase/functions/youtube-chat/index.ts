import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "Server missing OPENAI_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { relevantContent, fullTranscript, messages } = await req.json();

    if (!relevantContent || typeof relevantContent !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'relevantContent'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatMessages = [
      {
        role: "system",
        content:
          "You are Ohsara. Answer based on the provided relevant video content that was extracted to match viewer expectations. If they ask for more details or something not covered in the relevant content, you can reference the full transcript. Be helpful and conversational.",
      },
      { role: "system", content: `RELEVANT CONTENT (extracted based on viewer expectations):\n${relevantContent.slice(0, 10000)}` },
      ...(fullTranscript ? [{ role: "system", content: `FULL TRANSCRIPT (for additional context if needed):\n${fullTranscript.slice(0, 20000)}` }] : []),
      ...((Array.isArray(messages) ? messages : []).map((m: any) => ({ role: m.role, content: m.content }))),
    ];

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: chatMessages,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("OpenAI error:", text);
      return new Response(JSON.stringify({ error: "OpenAI failed", details: text }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("youtube-chat error:", error);
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: error?.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});