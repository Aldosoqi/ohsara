import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY not found');
    return new Response(
      JSON.stringify({ error: 'Gemini API key not configured' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const { transcript, chatHistory, currentQuery } = await req.json();

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