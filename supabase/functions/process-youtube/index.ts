import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openAIApiKey = Deno.env.get('OPENAI_API_KEY')!;
const apifyApiKey = Deno.env.get('APIFY_API_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { youtubeUrl, analysisType, customRequest } = await req.json();
    
    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log(`Processing YouTube URL: ${youtubeUrl} for user: ${user.id}`);

    // Step 1: Extract video ID from URL
    const videoId = extractVideoId(youtubeUrl);
    if (!videoId) {
      throw new Error('Invalid YouTube URL');
    }

    // Step 2: Check and deduct credits
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.credits < 1) {
      throw new Error('Insufficient credits');
    }

    // Deduct credit first
    const { error: creditError } = await supabase.rpc('update_user_credits', {
      user_id_param: user.id,
      credit_amount: -1,
      transaction_type_param: 'usage',
      description_param: 'YouTube video analysis'
    });

    if (creditError) {
      throw new Error('Failed to deduct credits');
    }

    // Step 3: Scrape transcript using Apify
    console.log('Starting transcript extraction for video ID:', videoId);
    const transcript = await scrapeTranscript(videoId);

    if (!transcript) {
      console.log('No transcript found, refunding credit...');
      // Refund credit if no transcript found
      await supabase.rpc('update_user_credits', {
        user_id_param: user.id,
        credit_amount: 1,
        transaction_type_param: 'refund',
        description_param: 'No transcript available - refunded'
      });
      
      return new Response(JSON.stringify({ 
        error: 'No transcript or captions available for this video. Your credit has been refunded.' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 4: Get video metadata
    const videoMetadata = await getVideoMetadata(videoId);

    // Step 5: Analyze transcript with RAG system
    console.log('Starting RAG-powered analysis...');
    
    let analysisPrompt;
    const maxChunkSize = 4000; // Optimal chunk size for embeddings
    
    if (transcript.length > maxChunkSize) {
      console.log('Creating RAG document store...');
      
      // Create enriched chunks with metadata
      const ragStore = await createRAGStore(transcript, maxChunkSize);
      console.log(`Created RAG store with ${ragStore.length} documents`);
      
      // Build query from analysis type and custom request
      const query = buildQueryFromRequest(analysisType, customRequest);
      console.log('RAG Query:', query);
      
      // Retrieve most relevant chunks
      const relevantChunks = await retrieveRelevantChunks(ragStore, query, 5);
      console.log(`RAG Retrieved ${relevantChunks.length} documents for query: "${query}"`);
      relevantChunks.forEach((chunk, i) => {
        console.log(`  ${i + 1}. Doc chunk_${chunk.metadata.chunkIndex} (keyword+semantic, score: ${chunk.score.toFixed(2)}) - ${chunk.metadata.position}`);
      });
      
      const contextualContent = relevantChunks.map(chunk => 
        `[Chunk ${chunk.metadata.chunkIndex} - ${chunk.metadata.position} (${chunk.metadata.timestamp})]\n${chunk.content}`
      ).join('\n\n---\n\n');
      
      analysisPrompt = buildAnalysisPrompt(analysisType, customRequest, contextualContent);
      analysisPrompt += `\n\nNote: Analysis based on ${relevantChunks.length} most relevant sections from a ${Math.floor(transcript.length / 1000)}k character transcript using RAG retrieval.`;
    } else {
      analysisPrompt = buildAnalysisPrompt(analysisType, customRequest, transcript);
    }
    
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Using the most advanced model for better analysis
        messages: [
          {
            role: 'system',
            content: 'You are an expert video content analyzer with deep expertise in multiple domains. Provide detailed, well-structured, and insightful analysis based on the user\'s requirements. Use proper formatting with headers, bullet points, and clear structure for readability.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        stream: true,
        temperature: 0.3, // Lower temperature for more focused, accurate analysis
        max_tokens: 4000
      }),
    });

    if (!openAIResponse.ok) {
      throw new Error('Failed to analyze content');
    }

    // Step 6: Save summary to database
    const { data: summary, error: summaryError } = await supabase
      .from('summaries')
      .insert({
        user_id: user.id,
        youtube_url: youtubeUrl,
        video_title: videoMetadata.title,
        video_description: videoMetadata.description,
        thumbnail_url: videoMetadata.thumbnail,
        duration: videoMetadata.duration,
        summary: 'Processing...', // Will be updated with actual content
      })
      .select()
      .single();

    if (summaryError) {
      console.error('Failed to save summary:', summaryError);
    }

    // Return streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const reader = openAIResponse.body?.getReader();
        if (!reader) return;

        let fullContent = '';
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  // Update summary with final content
                  if (summary && fullContent) {
                    await supabase
                      .from('summaries')
                      .update({ summary: fullContent })
                      .eq('id', summary.id);
                  }
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  const content = parsed.choices?.[0]?.delta?.content;
                  if (content) {
                    fullContent += content;
                    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ content, videoMetadata, summaryId: summary?.id })}\n\n`));
                  }
                } catch (e) {
                  // Skip invalid JSON
                }
              }
            }
          }
        } catch (error) {
          console.error('Streaming error:', error);
          controller.error(error);
        }
      }
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in process-youtube function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function scrapeTranscript(videoId: string): Promise<string | null> {
  try {
    console.log('Calling Apify API for video ID:', videoId);
    const apifyUrl = `https://api.apify.com/v2/acts/pintostudio~youtube-transcript-scraper/run-sync-get-dataset-items?token=${apifyApiKey}`;
    
    const requestBody = {
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`
    };
    
    console.log('Apify request body:', JSON.stringify(requestBody));
    
    const response = await fetch(apifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Apify response status:', response.status);
    console.log('Apify response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Apify API error details:', errorText);
      return null;
    }

    const data = await response.json();
    console.log('Full Apify response data:', JSON.stringify(data, null, 2));
    
    if (!data || data.length === 0) {
      console.log('Empty data array returned from Apify for video:', videoId);
      return null;
    }

    const firstItem = data[0];
    console.log('First item structure:', Object.keys(firstItem || {}));
    console.log('First item data:', JSON.stringify(firstItem, null, 2));

    const transcriptData = firstItem?.data;
    if (!transcriptData || !Array.isArray(transcriptData)) {
      console.log('No transcript data array found in response');
      return null;
    }

    // Filter out items without text and extract text content
    const textItems = transcriptData.filter(item => item?.text);
    
    if (textItems.length === 0) {
      console.log('No text items found in transcript data');
      return null;
    }

    // Join all text segments
    const joinedTranscript = textItems.map(item => item.text).join(' ');
    
    console.log('Extracted transcript length:', joinedTranscript.length);
    console.log('First 200 characters:', joinedTranscript.substring(0, 200));
    
    return joinedTranscript;
  } catch (error) {
    console.error('Error scraping transcript:', error);
    return null;
  }
}

async function getVideoMetadata(videoId: string) {
  try {
    // Use YouTube API or scraping to get metadata
    // For now, return basic structure
    return {
      title: 'Video Title',
      description: 'Video Description',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration: 0
    };
  } catch (error) {
    console.error('Error getting video metadata:', error);
    return {
      title: 'Unknown Title',
      description: '',
      thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      duration: 0
    };
  }
}

function buildAnalysisPrompt(analysisType: string, customRequest: string, transcript: string): string {
  const basePrompt = `Please analyze the following video transcript:\n\n${transcript}\n\n`;
  
  switch (analysisType) {
    case 'summary':
      return basePrompt + 'Provide a comprehensive summary of the main points and key information covered in this video.';
    
    case 'key-takeaways':
      return basePrompt + 'Extract and list the most important key takeaways and insights from this video.';
    
    case 'step-by-step':
      return basePrompt + 'Break down all the steps, processes, or methodologies mentioned in this video in a detailed, sequential manner.';
    
    case 'general-explanation':
      return basePrompt + 'Provide a clear, simple explanation of the concepts and topics discussed in this video.';
    
    case 'tech-review':
      return basePrompt + 'Provide a technical analysis and review of the content, including technical details, pros/cons, and expert insights.';
    
    case 'custom':
      return basePrompt + `Based on this specific request: "${customRequest}", please analyze the content accordingly.`;
    
    default:
      return basePrompt + 'Provide a comprehensive analysis of this video content.';
  }
}

// RAG System Implementation
interface RAGDocument {
  content: string;
  embedding: number[];
  metadata: {
    chunkIndex: number;
    position: 'beginning' | 'middle' | 'end';
    timestamp: string;
    topics: string[];
    entities: string[];
    wordCount: number;
  };
  score?: number;
}

async function createRAGStore(transcript: string, chunkSize: number): Promise<RAGDocument[]> {
  const totalLength = transcript.length;
  const overlap = Math.floor(chunkSize * 0.1); // 10% overlap
  
  // First pass: create chunks and extract metadata
  const chunksData: Array<{
    content: string;
    chunkIndex: number;
    position: 'beginning' | 'middle' | 'end';
    timestamp: string;
    topics: string[];
    entities: string[];
    wordCount: number;
  }> = [];
  
  const texts: string[] = [];
  
  for (let i = 0; i < transcript.length; i += chunkSize - overlap) {
    const chunk = transcript.substring(i, i + chunkSize);
    if (chunk.trim().length < 100) continue; // Skip very small chunks
    
    const chunkIndex = Math.floor(i / (chunkSize - overlap));
    const position = i < totalLength * 0.33 ? 'beginning' : 
                    i < totalLength * 0.67 ? 'middle' : 'end';
    
    // Extract metadata
    const topics = extractTopics(chunk);
    const entities = extractEntities(chunk);
    const timestamp = estimateTimestamp(i, totalLength);
    
    chunksData.push({
      content: chunk,
      chunkIndex,
      position,
      timestamp,
      topics,
      entities,
      wordCount: chunk.split(' ').length
    });
    
    texts.push(chunk);
  }
  
  console.log(`Processing ${texts.length} chunks for embeddings...`);
  
  // Second pass: create embeddings in batches for efficiency
  const embeddings = await createEmbeddingsBatch(texts);
  
  // Combine chunks with embeddings
  const documents: RAGDocument[] = chunksData.map((chunkData, index) => ({
    content: chunkData.content,
    embedding: embeddings[index] || Array(1024).fill(0),
    metadata: {
      chunkIndex: chunkData.chunkIndex,
      position: chunkData.position,
      timestamp: chunkData.timestamp,
      topics: chunkData.topics,
      entities: chunkData.entities,
      wordCount: chunkData.wordCount
    }
  }));
  
  return documents;
}

async function createEmbedding(text: string, retries = 3): Promise<number[]> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-large', // Most advanced embedding model
          input: text.substring(0, 8000), // Limit input size
          encoding_format: 'float',
          dimensions: 1024 // Optimize for performance while maintaining quality
        }),
      });
      
      if (response.status === 429) {
        // Rate limit hit - exponential backoff
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s delays
        console.log(`Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      if (!response.ok) {
        console.error('Embedding API error:', response.status, await response.text());
        if (attempt === retries - 1) {
          return Array(1024).fill(0); // Return zero vector as fallback
        }
        continue;
      }
      
      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error(`Error creating embedding (attempt ${attempt + 1}):`, error);
      if (attempt === retries - 1) {
        return Array(1024).fill(0); // Return zero vector as fallback
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }
  return Array(1024).fill(0);
}

// Batch embedding creation to avoid rate limits
async function createEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const batchSize = 100; // OpenAI allows up to 2048 inputs per request
  const embeddings: number[][] = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(`Processing embedding batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(texts.length/batchSize)}`);
    
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-large',
          input: batch.map(text => text.substring(0, 8000)),
          encoding_format: 'float',
          dimensions: 1024
        }),
      });
      
      if (response.status === 429) {
        // Rate limit - wait and retry with exponential backoff
        const delay = Math.min(30000, Math.pow(2, Math.floor(i/batchSize)) * 2000);
        console.log(`Rate limit hit, waiting ${delay}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, delay));
        i -= batchSize; // Retry this batch
        continue;
      }
      
      if (!response.ok) {
        console.error('Batch embedding error:', response.status, await response.text());
        // Fill with zero vectors for failed batch
        for (let j = 0; j < batch.length; j++) {
          embeddings.push(Array(1024).fill(0));
        }
        continue;
      }
      
      const data = await response.json();
      embeddings.push(...data.data.map((item: any) => item.embedding));
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error('Batch embedding error:', error);
      // Fill with zero vectors for failed batch
      for (let j = 0; j < batch.length; j++) {
        embeddings.push(Array(1024).fill(0));
      }
    }
  }
  
  return embeddings;
}

function extractTopics(text: string): string[] {
  const topicKeywords = [
    'technology', 'business', 'science', 'health', 'education', 'entertainment',
    'sports', 'politics', 'economics', 'environment', 'culture', 'travel',
    'food', 'fashion', 'art', 'music', 'finance', 'marketing', 'productivity',
    'leadership', 'innovation', 'startup', 'investment', 'cryptocurrency',
    'AI', 'machine learning', 'blockchain', 'sustainability', 'mental health'
  ];
  
  const lowerText = text.toLowerCase();
  return topicKeywords.filter(keyword => 
    lowerText.includes(keyword) || lowerText.includes(keyword.replace(' ', ''))
  );
}

function extractEntities(text: string): string[] {
  // Simple entity extraction using regex patterns
  const entities: string[] = [];
  
  // Names (capitalized words)
  const nameMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
  if (nameMatches) entities.push(...nameMatches.slice(0, 5));
  
  // Companies/brands (common patterns)
  const companyMatches = text.match(/\b(?:Apple|Google|Microsoft|Amazon|Facebook|Tesla|Netflix|Spotify|Instagram|Twitter|YouTube|TikTok|OpenAI|Meta)\b/gi);
  if (companyMatches) entities.push(...companyMatches);
  
  // Numbers and dates
  const numberMatches = text.match(/\b\d{4}\b|\b\d+%\b|\$\d+(?:\.\d{2})?\b/g);
  if (numberMatches) entities.push(...numberMatches.slice(0, 3));
  
  return [...new Set(entities)]; // Remove duplicates
}

function estimateTimestamp(position: number, totalLength: number): string {
  // Rough estimate assuming average speaking rate
  const progressRatio = position / totalLength;
  const estimatedMinutes = Math.floor(progressRatio * 60); // Assume 60min total
  const minutes = Math.floor(estimatedMinutes);
  const seconds = Math.floor((estimatedMinutes % 1) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function buildQueryFromRequest(analysisType: string, customRequest: string): string {
  const baseQueries = {
    'summary': 'main points key information overview',
    'key-takeaways': 'important insights lessons learned takeaways',
    'step-by-step': 'process steps methodology instructions how to',
    'general-explanation': 'explanation concepts definition meaning',
    'tech-review': 'technical analysis review pros cons evaluation',
    'custom': customRequest || 'general analysis'
  };
  
  return baseQueries[analysisType as keyof typeof baseQueries] || customRequest || 'general analysis';
}

async function retrieveRelevantChunks(
  ragStore: RAGDocument[], 
  query: string, 
  topK: number = 5
): Promise<RAGDocument[]> {
  // Create query embedding
  const queryEmbedding = await createEmbedding(query);
  
  // Calculate hybrid scores (keyword + semantic similarity)
  const scoredDocs = ragStore.map(doc => {
    // Semantic similarity (cosine similarity)
    const semanticScore = cosineSimilarity(queryEmbedding, doc.embedding);
    
    // Keyword matching score
    const keywordScore = calculateKeywordScore(query, doc.content);
    
    // Topic relevance score
    const topicScore = calculateTopicScore(query, doc.metadata.topics);
    
    // Combined score with weights
    const finalScore = (semanticScore * 0.5) + (keywordScore * 0.3) + (topicScore * 0.2);
    
    return { ...doc, score: finalScore };
  });
  
  // Sort by score and return top K
  return scoredDocs
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, topK);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function calculateKeywordScore(query: string, content: string): number {
  const queryWords = query.toLowerCase().split(/\s+/);
  const contentLower = content.toLowerCase();
  
  let matches = 0;
  for (const word of queryWords) {
    if (word.length > 2 && contentLower.includes(word)) {
      matches++;
    }
  }
  
  return matches / queryWords.length;
}

function calculateTopicScore(query: string, topics: string[]): number {
  const queryLower = query.toLowerCase();
  let matches = 0;
  
  for (const topic of topics) {
    if (queryLower.includes(topic.toLowerCase())) {
      matches++;
    }
  }
  
  return topics.length > 0 ? matches / topics.length : 0;
}