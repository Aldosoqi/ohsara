import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

interface VideoMetadata {
  title: string;
  duration: string;
  description: string;
  thumbnailUrl?: string;
}

interface QAPair {
  question: string;
  answer: string;
  category: string;
  importance: number;
  timestamp?: string;
  chunkIndex?: number;
}

interface ContentChunk {
  text: string;
  startIndex: number;
  endIndex: number;
  chunkNumber: number;
}

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

async function getVideoTranscript(videoId: string): Promise<string> {
  try {
    console.log('Fetching transcript for video:', videoId);
    
    // Try multiple transcript APIs as fallback
    const transcriptUrls = [
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=json3`,
      `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
    ];

    for (const url of transcriptUrls) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.text();
          
          if (url.includes('json3')) {
            const jsonData = JSON.parse(data);
            if (jsonData.events) {
              return jsonData.events
                .filter((event: any) => event.segs)
                .map((event: any) => event.segs.map((seg: any) => seg.utf8).join(''))
                .join(' ')
                .replace(/\n/g, ' ')
                .trim();
            }
          } else {
            // Parse SRV3 format
            const textMatches = data.match(/<text[^>]*>(.*?)<\/text>/g);
            if (textMatches) {
              return textMatches
                .map(match => match.replace(/<[^>]*>/g, ''))
                .join(' ')
                .replace(/\n/g, ' ')
                .trim();
            }
          }
        }
      } catch (error) {
        console.log(`Failed to fetch from ${url}:`, error.message);
        continue;
      }
    }

    throw new Error('No transcript available for this video');
  } catch (error) {
    console.error('Error fetching transcript:', error);
    throw error;
  }
}

async function getVideoMetadata(videoId: string): Promise<VideoMetadata> {
  const youtubeApiKey = Deno.env.get('YOUTUBE_API_KEY');
  
  try {
    console.log('Fetching metadata for video:', videoId);
    
    if (!youtubeApiKey) {
      console.log('YouTube API key not available, using fallback metadata');
      return {
        title: 'Video Analysis',
        duration: 'Unknown',
        description: 'Video content analysis'
      };
    }

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${youtubeApiKey}&part=snippet,contentDetails`
    );

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      throw new Error('Video not found');
    }

    const video = data.items[0];
    const snippet = video.snippet;
    const contentDetails = video.contentDetails;

    return {
      title: snippet.title || 'Untitled Video',
      duration: contentDetails.duration || 'Unknown',
      description: snippet.description || '',
      thumbnailUrl: snippet.thumbnails?.default?.url
    };
  } catch (error) {
    console.error('Error fetching video metadata:', error);
    // Return fallback metadata
    return {
      title: 'Video Analysis',
      duration: 'Unknown',
      description: 'Video content analysis'
    };
  }
}

function getSystemPrompt(analysisType: string, isChunked: boolean = false, chunkInfo?: string): string {
  const basePrompt = `You are an expert video content analyzer. Extract comprehensive insights and generate Q&A pairs covering ALL aspects of the content.

${isChunked ? `NOTE: This is part of a larger transcript. ${chunkInfo || ''} Focus on this section while maintaining awareness of the broader context.` : ''}

EXTRACTION FOCUS AREAS:
1. TITLE KEYWORDS: Extract and analyze key terms, promises, and hooks from the title
2. VISUAL PROPERTIES: Analyze thumbnail elements, visual cues, branding, and design choices
3. TEXT ELEMENTS: Identify on-screen text, captions, graphics, and textual information
4. VIEWER EXPECTATIONS: Determine what viewers expect vs. what's actually delivered

Return a JSON array with this structure:
{
  "question": "string",
  "answer": "string", 
  "category": "title-analysis|visual-analysis|text-elements|viewer-expectations|content-core|practical-insights",
  "importance": number (1-5),
  "timestamp": "MM:SS" (if available),
  "extraction_type": "keyword|visual|textual|expectation|core-content"
}`;

  switch (analysisType) {
    case 'comprehensive':
      return `${basePrompt}

COMPREHENSIVE ANALYSIS:
- Extract EVERY significant detail from title, visuals, text, and content
- Cover all promises made in title/thumbnail vs. actual delivery
- Identify every visual element and its purpose
- Extract all on-screen text and its context
- Generate ${isChunked ? '6-10' : '12-20'} Q&A pairs covering:
  * Title keyword analysis (2-3 pairs)
  * Thumbnail visual breakdown (2-3 pairs)
  * Text elements identification (2-4 pairs)
  * Viewer expectation vs reality (2-3 pairs)
  * Core content extraction (4-8 pairs)`;

    case 'key-points':
      return `${basePrompt}

KEY POINTS FOCUS:
- Extract most impactful title keywords and their implications
- Identify primary visual hooks and their effectiveness
- Focus on main text elements that drive the message
- Analyze core viewer expectations vs. key deliverables
- Generate ${isChunked ? '4-6' : '8-12'} Q&A pairs covering:
  * Critical title elements (1-2 pairs)
  * Main visual hooks (1-2 pairs)
  * Key text messages (1-2 pairs)
  * Primary expectations (1-2 pairs)
  * Essential content points (3-4 pairs)`;

    case 'academic':
      return `${basePrompt}

ACADEMIC ANALYSIS:
- Analyze title for educational keywords and learning objectives
- Examine visual elements for educational design principles
- Extract all textual information for academic context
- Assess educational expectations vs. academic delivery
- Generate ${isChunked ? '5-8' : '10-15'} Q&A pairs covering:
  * Educational title elements (2 pairs)
  * Academic visual design (2 pairs)
  * Textual learning aids (2-3 pairs)
  * Learning expectations (2 pairs)
  * Academic content core (3-6 pairs)`;

    case 'tutorial':
      return `${basePrompt}

TUTORIAL ANALYSIS:
- Extract action keywords and process indicators from title
- Analyze visual cues for step-by-step guidance
- Identify instructional text elements and guides
- Evaluate tutorial expectations vs. actual instruction quality
- Generate ${isChunked ? '4-7' : '8-14'} Q&A pairs covering:
  * Tutorial title promises (1-2 pairs)
  * Visual instruction cues (1-2 pairs)
  * Instructional text elements (2-3 pairs)
  * Tutorial expectations (1-2 pairs)
  * Step-by-step content (3-6 pairs)`;

    default:
      return `${basePrompt}

STANDARD ANALYSIS:
- Balance extraction across title, visuals, text, and content
- Identify key elements without overwhelming detail
- Focus on viewer journey from expectation to delivery
- Generate ${isChunked ? '4-6' : '8-12'} Q&A pairs covering:
  * Title keyword insights (1-2 pairs)
  * Visual element analysis (1-2 pairs)
  * Text element extraction (1-2 pairs)
  * Expectation analysis (1-2 pairs)
  * Core content highlights (3-4 pairs)`;
  }
}

function createContentChunks(transcript: string, tier: string): ContentChunk[] {
  // Determine chunk size based on content tier
  const chunkSizes = {
    'micro': 15000,     // Single chunk
    'short': 15000,     // Single chunk
    'medium': 12000,    // 2-3 chunks with overlap
    'long': 10000,      // 3-5 chunks with overlap
    'extended': 8000,   // 5-8 chunks with overlap
    'marathon': 6000    // 8+ chunks with overlap
  };

  const chunkSize = chunkSizes[tier as keyof typeof chunkSizes] || 10000;
  const overlapSize = Math.floor(chunkSize * 0.2); // 20% overlap

  // For micro and short content, return single chunk
  if (tier === 'micro' || tier === 'short' || transcript.length <= chunkSize) {
    return [{
      text: transcript,
      startIndex: 0,
      endIndex: transcript.length,
      chunkNumber: 1
    }];
  }

  const chunks: ContentChunk[] = [];
  let startIndex = 0;
  let chunkNumber = 1;

  while (startIndex < transcript.length) {
    let endIndex = Math.min(startIndex + chunkSize, transcript.length);
    
    // Try to end at a sentence boundary if possible
    if (endIndex < transcript.length) {
      const sentenceEnd = transcript.lastIndexOf('.', endIndex);
      const questionEnd = transcript.lastIndexOf('?', endIndex);
      const exclamationEnd = transcript.lastIndexOf('!', endIndex);
      
      const bestEnd = Math.max(sentenceEnd, questionEnd, exclamationEnd);
      if (bestEnd > startIndex + chunkSize * 0.7) {
        endIndex = bestEnd + 1;
      }
    }

    chunks.push({
      text: transcript.substring(startIndex, endIndex),
      startIndex,
      endIndex,
      chunkNumber
    });

    startIndex = endIndex - overlapSize;
    chunkNumber++;
  }

  return chunks;
}

async function processChunk(
  chunk: ContentChunk, 
  analysisType: string, 
  openaiApiKey: string, 
  totalChunks: number, 
  metadata: VideoMetadata,
  thumbnailAnalysis?: string
): Promise<QAPair[]> {
  const chunkInfo = totalChunks > 1 ? `This is chunk ${chunk.chunkNumber} of ${totalChunks}.` : '';
  const systemPrompt = getSystemPrompt(analysisType, totalChunks > 1, chunkInfo);
  
  // Prepare comprehensive context including title, thumbnail, and content
  let analysisContext = `VIDEO TITLE: "${metadata.title}"
VIDEO DESCRIPTION: ${metadata.description.substring(0, 500)}${metadata.description.length > 500 ? '...' : ''}

${thumbnailAnalysis ? `THUMBNAIL ANALYSIS: ${thumbnailAnalysis}` : ''}

TRANSCRIPT SECTION:
${chunk.text}`;

  try {
    console.log(`Processing chunk ${chunk.chunkNumber}/${totalChunks} with comprehensive analysis`);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Analyze this video content comprehensively, focusing on title keywords, visual elements, text components, and viewer expectations:\n\n${analysisContext}`
          }
        ],
        max_tokens: 2500,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error for chunk ${chunk.chunkNumber}: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    try {
      const qaPairs = JSON.parse(content);
      
      if (Array.isArray(qaPairs)) {
        return qaPairs.map(qa => ({
          question: qa.question || '',
          answer: qa.answer || '',
          category: qa.category || 'content-core',
          importance: qa.importance || 3,
          timestamp: qa.timestamp || undefined,
          chunkIndex: chunk.chunkNumber,
          extractionType: qa.extraction_type || 'core-content'
        }));
      }
    } catch (parseError) {
      console.error(`Error parsing chunk ${chunk.chunkNumber} response:`, parseError);
    }

    return [];
  } catch (error) {
    console.error(`Error processing chunk ${chunk.chunkNumber}:`, error);
    return [];
  }
}

function deduplicateAndRankQAPairs(allQAPairs: QAPair[]): QAPair[] {
  // Prioritize extraction categories for comprehensive coverage
  const categoryPriority = {
    'title-analysis': 5,
    'visual-analysis': 4,
    'text-elements': 4,
    'viewer-expectations': 5,
    'content-core': 3,
    'practical-insights': 4
  };

  // Group similar questions and keep the best ones
  const questionGroups = new Map<string, QAPair[]>();
  
  allQAPairs.forEach(qa => {
    const normalizedQuestion = qa.question.toLowerCase().replace(/[^\w\s]/g, '').trim();
    const key = normalizedQuestion.substring(0, 60); // Use first 60 chars as key
    
    if (!questionGroups.has(key)) {
      questionGroups.set(key, []);
    }
    questionGroups.get(key)!.push(qa);
  });
  
  const deduplicatedPairs: QAPair[] = [];
  
  questionGroups.forEach(group => {
    if (group.length === 1) {
      deduplicatedPairs.push(group[0]);
    } else {
      // Keep the one with highest category priority, then importance, then detail
      const best = group.reduce((prev, current) => {
        const prevPriority = categoryPriority[prev.category as keyof typeof categoryPriority] || 2;
        const currentPriority = categoryPriority[current.category as keyof typeof categoryPriority] || 2;
        
        if (currentPriority > prevPriority) return current;
        if (currentPriority === prevPriority && current.importance > prev.importance) return current;
        if (currentPriority === prevPriority && current.importance === prev.importance && current.answer.length > prev.answer.length) return current;
        return prev;
      });
      deduplicatedPairs.push(best);
    }
  });
  
  // Sort by category priority, then importance, ensuring comprehensive coverage
  return deduplicatedPairs
    .sort((a, b) => {
      const aPriority = categoryPriority[a.category as keyof typeof categoryPriority] || 2;
      const bPriority = categoryPriority[b.category as keyof typeof categoryPriority] || 2;
      
      if (bPriority !== aPriority) return bPriority - aPriority;
      if (b.importance !== a.importance) return b.importance - a.importance;
      return a.category.localeCompare(b.category);
    })
    .slice(0, 25); // Increased limit for comprehensive coverage
}

async function generateThumbnailAnalysis(thumbnailUrl: string, openaiApiKey: string): Promise<string> {
  if (!thumbnailUrl) return '';
  
  try {
    console.log('Analyzing thumbnail:', thumbnailUrl);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'system',
            content: 'Analyze this video thumbnail image. Focus on: visual design elements, text overlays, color schemes, facial expressions, objects, branding elements, and overall visual appeal. Provide a concise analysis in 2-3 sentences.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Please analyze this video thumbnail:'
              },
              {
                type: 'image_url',
                image_url: {
                  url: thumbnailUrl
                }
              }
            ]
          }
        ],
        max_tokens: 300,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      console.log('Thumbnail analysis failed, continuing without it');
      return '';
    }

    const data = await response.json();
    return data.choices[0].message.content || '';
  } catch (error) {
    console.error('Error analyzing thumbnail:', error);
    return '';
  }
}

async function generateQAPairs(transcript: string, metadata: VideoMetadata, analysisType: string = 'standard'): Promise<QAPair[]> {
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    console.log('Starting comprehensive Q&A generation with:', analysisType);
    
    // Generate thumbnail analysis if available
    let thumbnailAnalysis = '';
    if (metadata.thumbnailUrl) {
      thumbnailAnalysis = await generateThumbnailAnalysis(metadata.thumbnailUrl, openaiApiKey);
    }
    
    // Determine content tier and create appropriate chunks
    const segmentCount = Math.ceil(transcript.length / 100);
    const tier = getContentTier(segmentCount);
    const chunks = createContentChunks(transcript, tier);
    
    console.log(`Created ${chunks.length} chunks for ${tier} tier content with comprehensive analysis`);
    
    // Process chunks in parallel with enhanced context
    const chunkPromises = chunks.map(chunk => 
      processChunk(chunk, analysisType, openaiApiKey, chunks.length, metadata, thumbnailAnalysis)
    );
    
    // Wait for all chunks to complete
    const chunkResults = await Promise.all(chunkPromises);
    
    // Flatten and combine all Q&A pairs
    const allQAPairs = chunkResults.flat();
    
    console.log(`Generated ${allQAPairs.length} total Q&A pairs covering title, visuals, text, and expectations`);
    
    // Deduplicate and rank with category prioritization
    const finalQAPairs = deduplicateAndRankQAPairs(allQAPairs);
    
    console.log(`Final comprehensive result: ${finalQAPairs.length} Q&A pairs with full coverage`);
    
    return finalQAPairs;
  } catch (error) {
    console.error('Error generating comprehensive Q&A pairs:', error);
    throw error;
  }
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

    // Extract video content
    console.log('Starting video content extraction...');
    
    let transcript = '';
    let metadata: VideoMetadata;
    let qaPairs: QAPair[] = [];
    
    try {
      // Get video transcript
      transcript = await getVideoTranscript(videoId);
      console.log('Transcript extracted, length:', transcript.length);
    } catch (error) {
      console.error('Failed to get transcript:', error);
      transcript = 'Transcript not available for this video.';
    }
    
    try {
      // Get video metadata
      metadata = await getVideoMetadata(videoId);
      console.log('Metadata extracted:', metadata.title);
    } catch (error) {
      console.error('Failed to get metadata:', error);
      metadata = {
        title: 'Video Analysis',
        duration: 'Unknown',
        description: 'Video content analysis'
      };
    }

    // Adjust credits based on actual content length if transcript is available
    if (userId && transcript && transcript !== 'Transcript not available for this video.') {
      const segmentCount = Math.ceil(transcript.length / 100); // Approximate segments
      const actualRequiredCredits = getRequiredCredits(analysisType, segmentCount);
      const initialCredits = getRequiredCredits(analysisType);
      
      if (actualRequiredCredits !== initialCredits) {
        const adjustment = actualRequiredCredits - initialCredits;
        console.log('Adjusting credits:', { initial: initialCredits, actual: actualRequiredCredits, adjustment });
        
        if (adjustment !== 0) {
          await supabase.rpc('apply_user_credits', {
            user_id_param: userId,
            credit_amount: -adjustment,
            transaction_type_param: 'usage',
            description_param: `Credit adjustment for video analysis (${getContentTier(segmentCount)})`,
          });
        }
      }
    }

    try {
      // Generate Q&A pairs using AI
      if (transcript && transcript !== 'Transcript not available for this video.') {
        qaPairs = await generateQAPairs(transcript, metadata, analysisType || 'standard');
        console.log('Generated Q&A pairs:', qaPairs.length);
      }
    } catch (error) {
      console.error('Failed to generate Q&A pairs:', error);
      qaPairs = [{
        question: 'What is this video about?',
        answer: 'This video analysis could not be completed due to processing limitations.',
        category: 'error',
        importance: 1
      }];
    }

    // Return comprehensive analysis results
    return new Response(JSON.stringify({
      success: true,
      videoId,
      metadata,
      transcript: transcript.substring(0, 5000), // Return first 5000 chars for reference
      qaPairs,
      analysis: {
        type: analysisType || 'standard',
        segmentCount: Math.ceil(transcript.length / 100),
        tier: getContentTier(Math.ceil(transcript.length / 100)),
        creditsUsed: userId ? getRequiredCredits(analysisType, Math.ceil(transcript.length / 100)) : 0,
        chunksProcessed: createContentChunks(transcript, getContentTier(Math.ceil(transcript.length / 100))).length,
        processingMethod: createContentChunks(transcript, getContentTier(Math.ceil(transcript.length / 100))).length > 1 ? 'chunked' : 'single'
      }
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
