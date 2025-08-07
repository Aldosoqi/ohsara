import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!GEMINI_API_KEY || !APIFY_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Required API keys not found');
    return new Response(
      JSON.stringify({ error: 'Required API keys not configured' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const { podcastUrl, transcript, chatHistory, currentQuery, action } = await req.json();

    // Handle scraping action
    if (action === 'scrape') {
      if (!podcastUrl) {
        throw new Error('Missing podcast URL');
      }

      // Get authenticated user
      const authHeader = req.headers.get("Authorization")!;
      const token = authHeader.replace("Bearer ", "");
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: userData } = await supabase.auth.getUser(token);
      
      if (!userData.user) {
        throw new Error('User not authenticated');
      }

      // Check user credits
      const { data: profile } = await supabase
        .from('profiles')
        .select('credits')
        .eq('user_id', userData.user.id)
        .single();

      if (!profile || profile.credits < 2.5) {
        throw new Error('Insufficient credits');
      }

      // Deduct credits
      await supabase.rpc('update_user_credits', {
        user_id_param: userData.user.id,
        credit_amount: -2.5,
        transaction_type_param: 'usage',
        description_param: 'Podcast transcript scraping'
      });

      // Scrape transcript using Apify
      const actorTaskUrl = `https://api.apify.com/v2/acts/apify~web-scraper/run-sync-get-dataset-items?token=${APIFY_API_KEY}`;
      
      const apifyResponse = await fetch(actorTaskUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startUrls: [{ url: podcastUrl }],
          pageFunction: `async function pageFunction(context) {
            const { page } = context;
            
            // Wait for content to load
            await page.waitForTimeout(3000);
            
            // Try to extract transcript from common podcast platforms
            let transcript = '';
            let title = '';
            
            // Get title
            title = await page.title() || '';
            
            // Look for transcript in various selectors
            const transcriptSelectors = [
              '.transcript',
              '[data-transcript]',
              '.episode-transcript',
              '.content-transcript',
              'article',
              '.post-content',
              '.episode-content'
            ];
            
            for (const selector of transcriptSelectors) {
              try {
                const element = await page.$(selector);
                if (element) {
                  const text = await page.evaluate(el => el.innerText, element);
                  if (text && text.length > transcript.length) {
                    transcript = text;
                  }
                }
              } catch (e) {
                // Continue to next selector
              }
            }
            
            return {
              title: title,
              transcript: transcript,
              url: page.url()
            };
          }`
        })
      });

      if (!apifyResponse.ok) {
        throw new Error('Failed to scrape podcast transcript');
      }

      const apifyData = await apifyResponse.json();
      const scrapedData = apifyData[0] || {};
      
      if (!scrapedData.transcript || scrapedData.transcript.length < 100) {
        throw new Error('Could not extract transcript from the provided URL');
      }

      return new Response(
        JSON.stringify({ 
          transcript: scrapedData.transcript,
          title: scrapedData.title 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Handle chat action
    if (!transcript || !currentQuery) {
      throw new Error('Missing transcript or query');
    }

    // Prepare context for Gemini
    let contextPrompt = `You are an AI assistant specialized in analyzing podcast content. You have access to the full transcript of a podcast and can answer detailed questions about it.

PODCAST TRANSCRIPT:
"""
${transcript}
"""

INSTRUCTIONS:
- You have the complete podcast transcript in your memory
- Answer questions based ONLY on the content from this transcript
- Provide detailed, well-formatted responses
- Use bullet points and numbered lists when appropriate
- Reference specific quotes or sections when relevant
- If something is not covered in the transcript, clearly state that
- Maintain context from previous questions in this conversation

`;

    // Add chat history for context
    if (chatHistory && chatHistory.length > 0) {
      contextPrompt += `\nPREVIOUS CONVERSATION:\n`;
      chatHistory.forEach((msg: any) => {
        if (msg.role === 'user') {
          contextPrompt += `Human: ${msg.content}\n`;
        } else if (msg.role === 'assistant') {
          contextPrompt += `Assistant: ${msg.content}\n`;
        }
      });
    }

    contextPrompt += `\nCURRENT QUESTION: ${currentQuery}

Please provide a comprehensive answer based on the podcast transcript:`;

    // Call Gemini API
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: contextPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH", 
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      console.error('Unexpected Gemini response format:', data);
      throw new Error('Invalid response from Gemini API');
    }

    const generatedResponse = data.candidates[0].content.parts[0].text;

    return new Response(
      JSON.stringify({ response: generatedResponse }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in process-podcast-chat function:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to process podcast chat'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});