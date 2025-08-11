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
    const { messages, extractedContent, fullTranscript } = await req.json();

    // Get auth user
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      userId = user?.id || null;
    }

    // Check and deduct credits if user is authenticated
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits')
        .eq('user_id', userId)
        .single();

      if (!profile || profile.credits < 0.5) {
        return new Response(JSON.stringify({
          error: "Insufficient credits. Need 0.5 credits for chat message."
        }), {
          status: 402,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }

      const { error: deductError } = await supabase.rpc('update_user_credits', {
        user_id_param: userId,
        credit_amount: -0.5,
        transaction_type_param: 'chat',
        description_param: 'YouTube chat message',
        reference_id_param: null
      });

      if (deductError) {
        return new Response(JSON.stringify({ error: 'Failed to deduct credits' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

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

    const systemMessage = {
      role: 'system',
      content: `You are an AI assistant helping users understand YouTube video content. You have access to a summary of key content addressing the viewer's expectations and the full transcript with timestamps. 

Focus primarily on the key content summary as it contains the most relevant information based on the user's expected needs from the video. Use the full transcript for additional context or to provide timestamps when needed.

When referencing specific information, always include relevant timestamps in your response so users can jump to that part of the video.`
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          systemMessage,
          { role: 'system', content: context },
          ...messages
        ],
        max_tokens: 500
      }),
    });

    const data = await response.json();
    const reply = data.choices[0].message.content;

    let remainingCredits: number | null = null;
    if (userId) {
      const { data: profileAfter } = await supabase
        .from('profiles')
        .select('credits')
        .eq('user_id', userId)
        .maybeSingle<{ credits: number }>();
      remainingCredits = profileAfter?.credits ?? null;
    }

    return new Response(JSON.stringify({ content: reply, creditsDeducted: userId ? 0.5 : 0, remainingCredits }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in youtube-chat function:', error);

    if (creditsDeducted && userId) {
      try {
        await supabase.rpc('update_user_credits', {
          user_id_param: userId,
          credit_amount: 0.5,
          transaction_type_param: 'refund',
          description_param: 'Chat message refund'
        });
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