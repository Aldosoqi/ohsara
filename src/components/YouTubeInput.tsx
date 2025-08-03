import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const analysisOptions = [
  { id: "summary", label: "Summary", description: "Get a concise overview of the main points" },
  { id: "key-takeaways", label: "Key Takeaways", description: "Extract the most important insights" },
  { id: "step-by-step", label: "All Steps", description: "Detailed breakdown of all processes" },
  { id: "general-explanation", label: "General Explanation", description: "Simple explanation of concepts" },
  { id: "tech-review", label: "Tech Review", description: "Technical analysis and evaluation" },
  { id: "custom", label: "Custom", description: "Specify your own requirements" }
];

export function YouTubeInput() {
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<"url" | "options" | "processing" | "results">("url");
  const [selectedOption, setSelectedOption] = useState("");
  const [customRequest, setCustomRequest] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [finalResult, setFinalResult] = useState("");
  const [videoMetadata, setVideoMetadata] = useState<any>(null);
  const [error, setError] = useState("");
  const [currentSummaryId, setCurrentSummaryId] = useState<string | null>(null);

  // Check for incomplete requests on mount
  useEffect(() => {
    const checkIncompleteRequest = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        // Get the most recent incomplete summary
        const { data: incompleteSummary } = await supabase
          .from('summaries')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('summary', '') // Check for empty string instead of null
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (incompleteSummary) {
          // Resume the incomplete request
          setUrl(incompleteSummary.youtube_url);
          setCurrentSummaryId(incompleteSummary.id);
          setStep("processing");
          setIsLoading(true);
          
          if (incompleteSummary.video_title) {
            setVideoMetadata({
              title: incompleteSummary.video_title,
              thumbnail: incompleteSummary.thumbnail_url
            });
          }
          
          setStreamingContent("Resuming your previous request...");
          
          // Continue processing from where it left off
          await continueProcessing(incompleteSummary.youtube_url, incompleteSummary.id);
        }
      } catch (error) {
        console.error('Error checking incomplete requests:', error);
      }
    };

    checkIncompleteRequest();
  }, []);

  const continueProcessing = async (youtubeUrl: string, summaryId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const streamResponse = await fetch(`https://zkoktwjrmmvmwiftxxmf.supabase.co/functions/v1/process-youtube`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inprb2t0d2pybW12bXdpZnR4eG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxNDk5OTQsImV4cCI6MjA2OTcyNTk5NH0.szbLke0RzFR-jdzUB9jrXmUPM2jsYWMrieCRwmRA0Fg'
        },
        body: JSON.stringify({
          youtubeUrl: youtubeUrl,
          analysisType: 'summary', // Default for resumed requests
          summaryId: summaryId
        })
      });

      if (!streamResponse.ok) {
        throw new Error('Failed to resume processing');
      }

      const reader = streamResponse.body?.getReader();
      if (!reader) {
        throw new Error('No readable stream available');
      }

      const decoder = new TextDecoder();
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                result += parsed.content;
                setStreamingContent(result);
              }
              if (parsed.videoMetadata) {
                setVideoMetadata(parsed.videoMetadata);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      // Update the summary in the database
      await supabase
        .from('summaries')
        .update({ 
          summary: result,
          updated_at: new Date().toISOString()
        })
        .eq('id', summaryId);

      setFinalResult(result);
      setStep("results");
      setIsLoading(false);
    } catch (error) {
      console.error('Error continuing processing:', error);
      setStep("processing");
      setStreamingContent("Sorry, there are too many requests. Please try again later. Your credit has been refunded.");
      setIsLoading(false);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUrl || isLoading) return;
    setStep("options");
  };

  const handleAnalysisSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOption) return;

    // Clear previous results before starting new request
    setStreamingContent("");
    setFinalResult("");
    setVideoMetadata(null);
    setError("");

    setIsLoading(true);
    setStep("processing");
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Create a new summary record in the database first
      const { data: newSummary, error: summaryError } = await supabase
        .from('summaries')
        .insert({
          user_id: session?.user?.id,
          youtube_url: url,
          summary: '', // Use empty string instead of null since column is NOT NULL
        })
        .select()
        .single();

      if (summaryError || !newSummary) {
        throw new Error('Failed to create summary record');
      }

      setCurrentSummaryId(newSummary.id);
      
      const streamResponse = await fetch(`https://zkoktwjrmmvmwiftxxmf.supabase.co/functions/v1/process-youtube`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inprb2t0d2pybW12bXdpZnR4eG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxNDk5OTQsImV4cCI6MjA2OTcyNTk5NH0.szbLke0RzFR-jdzUB9jrXmUPM2jsYWMrieCRwmRA0Fg'
        },
        body: JSON.stringify({
          youtubeUrl: url,
          analysisType: selectedOption,
          customRequest: customRequest
        })
      });

      if (!streamResponse.ok) {
        const errorData = await streamResponse.json().catch(() => ({ error: 'Edge Function returned a non-2xx status code' }));
        throw new Error(errorData.error || 'Edge Function returned a non-2xx status code');
      }

      // Handle streaming response
      const reader = streamResponse.body?.getReader();
      if (!reader) {
        throw new Error('No readable stream available');
      }

      const decoder = new TextDecoder();
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                result += parsed.content;
                setStreamingContent(result);
              }
              if (parsed.videoMetadata) {
                setVideoMetadata(parsed.videoMetadata);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }

      // Update the summary in the database
      await supabase
        .from('summaries')
        .update({ 
          summary: result,
          video_title: videoMetadata?.title,
          thumbnail_url: videoMetadata?.thumbnail,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentSummaryId);

      setFinalResult(result);
      setStep("results");
      setIsLoading(false);
    } catch (error) {
      console.error('Error processing video:', error);
      
      // Only refund credit if summary was created (meaning we actually charged the user)
      if (currentSummaryId) {
        try {
          await supabase.rpc('update_user_credits', {
            user_id_param: (await supabase.auth.getSession()).data.session?.user?.id,
            credit_amount: 1,
            transaction_type_param: 'refund',
            description_param: 'Processing failed - refunded'
          });
          
          // Delete the incomplete summary record
          await supabase
            .from('summaries')
            .delete()
            .eq('id', currentSummaryId);
        } catch (refundError) {
          console.error('Failed to refund credit:', refundError);
        }
      }
      
      // Show appropriate error message based on the error
      setStep("processing");
      if (error.message === 'Failed to create summary record') {
        setStreamingContent("Please make sure you're logged in and try again.");
      } else {
        setStreamingContent("Sorry, there are too many requests. Please try again later. Your credit has been refunded.");
      }
      setIsLoading(false);
    }
  };

  const goBack = () => {
    setStep("url");
    setSelectedOption("");
    setCustomRequest("");
    setIsLoading(false); // Reset loading state when going back
    setStreamingContent("");
    setFinalResult("");
    setVideoMetadata(null);
    setError("");
  };

  const isValidUrl = url.includes("youtube.com") || url.includes("youtu.be");

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h1 className="ohsara-logo text-6xl font-light tracking-tight text-foreground mb-6">
          ohsara
        </h1>
      </div>

{step === "url" ? (
        <form onSubmit={handleUrlSubmit} className="space-y-4">
          <div className="relative">
            <Input
              type="url"
              placeholder="Paste a YouTube URL to get its core knowledge..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-14 text-lg px-6 pr-32 rounded-xl border-2 border-border 
                       focus:border-primary focus:ring-primary focus:ring-2 focus:ring-opacity-20
                       bg-card shadow-subtle transition-all duration-200"
              disabled={isLoading}
            />
            
            <Button
              type="submit"
              disabled={!isValidUrl || isLoading}
              className="absolute right-2 top-2 h-10 px-6 rounded-lg bg-primary hover:bg-primary/90 
                       text-primary-foreground font-medium transition-all duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="h-4 w-4 mr-2" />
              Continue
            </Button>
          </div>

          {url && !isValidUrl && (
            <p className="text-sm text-destructive text-center">
              Please enter a valid YouTube URL
            </p>
          )}
        </form>
      ) : step === "options" ? (
        <div className="space-y-6">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={goBack}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="text-sm text-muted-foreground truncate">
              {url}
            </div>
          </div>

          <form onSubmit={handleAnalysisSubmit} className="space-y-6">
            <div className="space-y-4">
              <Label className="text-lg font-medium">What do you need from this video?</Label>
              
              <div className="grid gap-3">
                {analysisOptions.map((option) => (
                  <label
                    key={option.id}
                    className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                      selectedOption === option.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-accent/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="analysisType"
                      value={option.id}
                      checked={selectedOption === option.id}
                      onChange={(e) => setSelectedOption(e.target.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{option.label}</div>
                      <div className="text-sm text-muted-foreground">{option.description}</div>
                    </div>
                  </label>
                ))}
              </div>

              {selectedOption === "custom" && (
                <div className="mt-4">
                  <Label htmlFor="customRequest" className="text-sm font-medium">
                    Describe what you need:
                  </Label>
                  <Input
                    id="customRequest"
                    value={customRequest}
                    onChange={(e) => setCustomRequest(e.target.value)}
                    placeholder="E.g., Focus on the marketing strategies mentioned..."
                    className="mt-2"
                  />
                </div>
              )}
            </div>

            <Button
              type="submit"
              disabled={!selectedOption || isLoading || (selectedOption === "custom" && !customRequest.trim())}
              className="w-full h-12 text-lg font-medium"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="h-5 w-5 mr-2" />
                  Analyze Video
                </>
              )}
            </Button>
          </form>
        </div>
      ) : step === "processing" ? (
        <div className="space-y-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-lg font-medium">Analyzing video...</span>
            </div>
            
            {videoMetadata && (
              <div className="bg-card border border-border rounded-lg p-4">
                <img 
                  src={videoMetadata.thumbnail} 
                  alt="Video thumbnail"
                  className="w-full aspect-video object-cover rounded-lg mb-3"
                />
                <h3 className="font-semibold text-lg">{videoMetadata.title}</h3>
              </div>
            )}

            {streamingContent && (
              <div className="bg-card border border-border rounded-lg p-6 text-left">
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {streamingContent}
                    <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : step === "results" ? (
        <div className="space-y-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep("url")}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Analyze Another Video
          </Button>

          {videoMetadata && (
            <div className="bg-card border border-border rounded-lg p-4">
              <img 
                src={videoMetadata.thumbnail} 
                alt="Video thumbnail"
                className="w-full aspect-video object-cover rounded-lg mb-3"
              />
              <h3 className="font-semibold text-lg">{videoMetadata.title}</h3>
            </div>
          )}

          <div className="bg-gradient-to-br from-card via-card to-accent/10 border border-border rounded-xl p-8 shadow-lg">
            <div className="prose prose-lg max-w-none text-foreground">
              <div 
                className="formatted-content space-y-4"
                dangerouslySetInnerHTML={{
                  __html: finalResult
                    .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold text-foreground mt-6 mb-3">$1</h3>')
                    .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold text-foreground mt-8 mb-4">$1</h2>')
                    .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold text-foreground mt-10 mb-5">$1</h1>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
                    .replace(/^[-•] (.*$)/gm, '<li class="ml-4 mb-1">$1</li>')
                    .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4 mb-1 list-decimal">$2</li>')
                    .replace(/\n\n/g, '</p><p class="mb-4">')
                    .replace(/^(?!<[h|l|s|e])/gm, '<p class="mb-4">')
                    .replace(/<\/p><p class="mb-4">(?=<[h|l])/g, '</p>')
                }}
              />
            </div>
          </div>
        </div>
      ) : null}


      {/* Loading progress bar */}
      {isLoading && (
        <div className="w-full bg-progress-background rounded-full h-1 overflow-hidden">
          <div className="loading-bar w-1/3 animate-pulse" />
        </div>
      )}
    </div>
  );
}