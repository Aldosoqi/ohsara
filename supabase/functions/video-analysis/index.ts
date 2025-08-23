import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// YouTube URL validation regex
const YOUTUBE_URL_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;

// Content length pricing tiers
const CONTENT_PRICING = {
  'micro': 1,    // ≤100 segments
  'short': 2,    // 101-400 segments  
  'medium': 3,   // 401-800 segments
  'long': 4,     // 801-1200 segments
  'extended': 6, // 1201-2000 segments
  'marathon': 8  // >2000 segments
};

function getContentTier(segmentCount: number): string {
  if (segmentCount <= 100) return 'micro';
  if (segmentCount <= 400) return 'short';
  if (segmentCount <= 800) return 'medium';
  if (segmentCount <= 1200) return 'long';
  if (segmentCount <= 2000) return 'extended';
  return 'marathon';
}

function getRequiredCredits(analysisType?: string, segmentCount?: number): number {
  // If analysis type is provided, use that for pricing
  if (analysisType && CONTENT_PRICING[analysisType as keyof typeof CONTENT_PRICING]) {
    return CONTENT_PRICING[analysisType as keyof typeof CONTENT_PRICING];
  }
  
  // Otherwise, determine based on segment count
  if (segmentCount !== undefined) {
    const tier = getContentTier(segmentCount);
    return CONTENT_PRICING[tier as keyof typeof CONTENT_PRICING];
  }
  
  // Default to medium if no info available
  return CONTENT_PRICING.medium;
}

function extractVideoId(url: string): string | null {
  const match = url.match(YOUTUBE_URL_REGEX);
  return match ? match[1] : null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Parse request body
    const body = await req.json();
    const { videoUrl, analysisType, userId } = body;

    console.log('Received request:', { videoUrl, analysisType, userId });

    // Validate required fields
    if (!videoUrl) {
      return new Response(JSON.stringify({ error: 'videoUrl is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract and validate YouTube video ID
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return new Response(JSON.stringify({ error: 'Invalid YouTube URL provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Extracted video ID:', videoId);

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Handle user authentication and credit management
    if (userId) {
      console.log('Checking credits for user:', userId);

      // Get current user credits
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('user_id', userId)
        .single();

      if (profileError) {
        console.error('Error fetching user profile:', profileError);
        return new Response(JSON.stringify({ error: 'User profile not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const currentCredits = profileData?.credits || 0;
      const requiredCredits = getRequiredCredits(analysisType);

      console.log('Credit check:', { currentCredits, requiredCredits });

      if (currentCredits < requiredCredits) {
        return new Response(JSON.stringify({ 
          error: 'Insufficient credits',
          required: requiredCredits,
          available: currentCredits
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Deduct initial credits (will be adjusted later based on actual content length)
      const { error: deductError } = await supabase.rpc('apply_user_credits', {
        user_id_param: userId,
        credit_amount: -requiredCredits,
        transaction_type_param: 'usage',
        description_param: `Video analysis: ${analysisType || 'standard'}`,
      });

      if (deductError) {
        console.error('Error deducting credits:', deductError);
        return new Response(JSON.stringify({ error: 'Failed to deduct credits' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('Credits deducted successfully');
    }

    // Return success response with extracted video info
    return new Response(JSON.stringify({
      success: true,
      videoId,
      message: 'Input validation completed successfully',
      creditInfo: userId ? {
        deducted: getRequiredCredits(analysisType),
        tier: analysisType || 'standard'
      } : null
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in video-analysis function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
