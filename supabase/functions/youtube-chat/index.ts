import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let userId: string | null = null;
  let creditsDeducted = false;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { messages, extractedContent, fullTranscript, responseLanguage } = await req.json();

    // Get auth user
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id || null;
    }

    // Check and deduct credits if user is authenticated
    if (userId) {
      let { data: profile } = await supabase
        .from('profiles')
        .select('credits')
        .eq('user_id', userId)
        .maybeSingle();

      if (!profile) {
        // Create minimal profile; credits default to 5 per DB default
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

      // Determine content length category for credit calculation
      const contentLength = fullTranscript?.length || 0;
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

      // Use 10% of analysis credits for chat (minimum 0.5)
      const chatCredits = Math.max(0.5, requiredCredits * 0.1);

      if ((profile.credits as number) < chatCredits) {
        return new Response(JSON.stringify({
          error: `Insufficient credits. Need ${chatCredits} credits for chat message.`
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
        .update({ credits: (profile.credits as number) - chatCredits })
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
        amount: -chatCredits,
        transaction_type: 'chat',
        description: `YouTube chat message (${contentCategory}: ${contentLength} segments)`
      });

      creditsDeducted = true;
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('Missing OpenAI API key');
    }

    // Build context from extracted content and full transcript
    const context = `
Key content addressing viewer expectations: ${extractedContent}

Full transcript with timestamps for reference: ${fullTranscript?.map(t => `[${t.start}s] ${t.text || ''}`).join('\n')}
`;

    const languageInstruction = (responseLanguage && responseLanguage !== 'automatic') ? ` Please respond in ${responseLanguage}.` : '';
    const systemMessage = {
      role: 'system',
      content: `You are an AI assistant helping users understand YouTube video content. You have access to a summary of key content addressing the viewer's expectations and the full transcript with timestamps. 

Focus primarily on the key content summary as it contains the most relevant information based on the user's expected needs from the video. Use the full transcript for additional context or to provide timestamps when needed.

When referencing specific information, always include relevant timestamps in your response so users can jump to that part of the video.${languageInstruction}`
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          systemMessage,
          { role: 'system', content: context },
          ...messages
        ],
        max_tokens: 500,
        stream: true
      }),
    });

    // Stream the chat response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const reader = response.body?.getReader();
          if (!reader) throw new Error("No response stream");
          
          let reply = "";
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
                    reply += content;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chat_chunk', content })}\n\n`));
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
          
          // Get remaining credits
          let remainingCredits: number | null = null;
          if (userId) {
            const { data: profileAfter } = await supabase
              .from('profiles')
              .select('credits')
              .eq('user_id', userId)
              .maybeSingle<{ credits: number }>();
            remainingCredits = profileAfter?.credits ?? null;
          }
          
          // Calculate actual credits deducted based on content length
          let actualCreditsDeducted = 0;
          if (userId) {
            const contentLength = fullTranscript?.length || 0;
            let requiredCredits = 1;
            if (contentLength > 2000) requiredCredits = 8;
            else if (contentLength > 1200) requiredCredits = 6;
            else if (contentLength > 800) requiredCredits = 4;
            else if (contentLength > 400) requiredCredits = 3;
            else if (contentLength > 100) requiredCredits = 2;
            
            actualCreditsDeducted = Math.max(0.5, requiredCredits * 0.1);
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'chat_complete', 
            reply,
            creditsDeducted: actualCreditsDeducted,
            remainingCredits 
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
    console.error('Error in youtube-chat function:', error);

    if (creditsDeducted && userId) {
      try {
        const { data: profileAfter, error: profErr } = await supabase
          .from('profiles')
          .select('credits')
          .eq('user_id', userId)
          .single();
        if (!profErr && profileAfter) {
          // Calculate refund amount based on what was actually deducted
          const contentLength = fullTranscript?.length || 0;
          let requiredCredits = 1;
          if (contentLength > 2000) requiredCredits = 8;
          else if (contentLength > 1200) requiredCredits = 6;
          else if (contentLength > 800) requiredCredits = 4;
          else if (contentLength > 400) requiredCredits = 3;
          else if (contentLength > 100) requiredCredits = 2;
          
          const refundAmount = Math.max(0.5, requiredCredits * 0.1);
          
          await supabase
            .from('profiles')
            .update({ credits: (profileAfter.credits as number) + refundAmount })
            .eq('user_id', userId);
          await supabase.from('credit_transactions').insert({
            user_id: userId,
            amount: refundAmount,
            transaction_type: 'refund',
            description: 'Chat message refund'
          });
        }
      } catch (refundError) {
        console.error('Failed to refund credits:', refundError);
      }
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});