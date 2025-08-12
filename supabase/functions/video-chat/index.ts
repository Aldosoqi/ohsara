import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
function chunkText(input: string, max = 120000) {
  if (!input) return "";
  return input.length > max ? input.slice(0, max) : input;
}
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, {
    headers: corsHeaders
  });
  try {
    const { mode, transcript, messages, url, title, thumbnail_url } = await req.json();
      const openaiKey = Deno.env.get("OPENAI_API_KEY");
      if (!openaiKey) {
        return new Response(JSON.stringify({
          error: "Server missing OPENAI_API_KEY"
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

      const supabaseClient = createClient(supabaseUrl, supabaseAnon);
      const supabaseService = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      });

      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
      } = await supabaseClient.auth.getUser(token);

      if (!user) {
        return new Response(JSON.stringify({ error: "User not authenticated" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (mode === "analyze") {
        const { error: creditError } = await supabaseService.rpc(
          "update_user_credits",
          {
            user_id_param: user.id,
            credit_amount: -5,
            transaction_type_param: "usage",
            description_param: "Video chat session",
            reference_id_param: null
          }
        );
        if (creditError) {
          return new Response(
            JSON.stringify({ error: "Insufficient credits" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" }
            }
          );
        }
      }
      const baseSystem = mode === "analyze" ? `You are Ohsara Intelligent, a smart video insight assistant.
- Analyze the visual click-appeal of the thumbnail and the semantics of the title.
- Using the provided transcript as the source of truth, map 5-10 concrete timestamps (mm:ss) that justify the thumbnail/title claims.
- Provide a compact, structured summary.
- If information is not present in the transcript, say so and avoid speculation.
Finish with: "You can ask me anything about this video."` : `You are Ohsara Intelligent. Answer strictly from the provided transcript. If unsure, say so and suggest where to look in the video. Cite timestamps like [mm:ss].`;
    const systemMessage = {
      role: "system",
      content: baseSystem
    };
    const transcriptMessage = transcript ? {
      role: "system",
      content: `Transcript (source of truth):\n${chunkText(transcript)}`
    } : null;
      let userFirst: { role: string; content: Array<{ type: string; text?: string; image_url?: { url: string } }> } | null = null;
      if (mode === "analyze") {
        const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
        content.push({
          type: "text",
          text: `Analyze this YouTube video.\nURL: ${url}\nTitle: ${title}`
        });
        if (thumbnail_url) {
          content.push({
            type: "image_url",
            image_url: {
              url: thumbnail_url
            }
          });
        }
        userFirst = {
          role: "user",
          content
        };
      }
      type Message = { role: string; content: unknown };
      const finalMessages: Message[] = [
        systemMessage
      ];
    if (transcriptMessage) finalMessages.push(transcriptMessage);
    if (userFirst) finalMessages.push(userFirst);
    if (Array.isArray(messages)) {
      // Pass through any prior chat turns
        for (const m of messages as Array<{ role: string; content: unknown }>) {
          finalMessages.push({
            role: m.role,
            content: m.content
          });
        }
      }
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-2025-04-14",
        messages: finalMessages,
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 1200,
        presence_penalty: 0,
        frequency_penalty: 1
      })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "OpenAI API error");
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return new Response(JSON.stringify({
      content
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error("video-chat error:", error);
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
