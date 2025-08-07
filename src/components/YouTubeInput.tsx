import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Play, Loader2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/hooks/useSettings";
import { useNotifications } from "@/hooks/useNotifications";
export function YouTubeInput() {
  const {
    requestNotifications
  } = useSettings();
  const {
    showRequestCompleteNotification
  } = useNotifications();
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<"request" | "url" | "processing" | "results">("request");
  const [userRequest, setUserRequest] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [finalResult, setFinalResult] = useState("");
  const [videoMetadata, setVideoMetadata] = useState<any>(null);
  const [error, setError] = useState("");
  const [currentSummaryId, setCurrentSummaryId] = useState<string | null>(null);
  const [pageVisible, setPageVisible] = useState(true);

  // Track page visibility for notifications
  useEffect(() => {
    const handleVisibilityChange = () => {
      setPageVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Clean up old incomplete summaries on mount
  useEffect(() => {
    const checkExistingRequests = async () => {
      try {
        const {
          data: {
            session
          }
        } = await supabase.auth.getSession();
        if (!session?.user?.id) return;

        // Clean up old incomplete summaries (older than 10 minutes)
        const {
          data: incompleteSummaries
        } = await supabase.from('summaries').select('*').eq('user_id', session.user.id).or('summary.eq.,summary.is.null,summary.eq.Processing...').order('created_at', {
          ascending: false
        });
        if (incompleteSummaries && incompleteSummaries.length > 0) {
          const now = new Date().getTime();
          const tenMinutesAgo = now - 10 * 60 * 1000;
          for (const summary of incompleteSummaries) {
            const requestTime = new Date(summary.created_at).getTime();
            if (requestTime < tenMinutesAgo) {
              console.log('Cleaning up old incomplete request:', summary.id);
              await supabase.from('summaries').delete().eq('id', summary.id);
            }
          }
        }
      } catch (error) {
        console.error('Error checking existing requests:', error);
      }
    };
    checkExistingRequests();
  }, []);
  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userRequest.trim()) return;
    setStep("url");
  };
  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUrl || isLoading) return;
    processVideo();
  };
  const processVideo = async () => {
    // Clear previous results before starting new request
    setStreamingContent("");
    setFinalResult("");
    setVideoMetadata(null);
    setError("");
    setIsLoading(true);
    setStep("processing");
    try {
      const {
        data: {
          session
        }
      } = await supabase.auth.getSession();

      // Create a new summary record in the database first
      const {
        data: newSummary,
        error: summaryError
      } = await supabase.from('summaries').insert({
        user_id: session?.user?.id,
        youtube_url: url,
        summary: '' // Use empty string instead of null since column is NOT NULL
      }).select().single();
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
          userRequest: userRequest
        })
      });
      if (!streamResponse.ok) {
        const errorData = await streamResponse.json().catch(() => ({
          error: 'Edge Function returned a non-2xx status code'
        }));
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
        const {
          done,
          value
        } = await reader.read();
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
      await supabase.from('summaries').update({
        summary: result,
        video_title: videoMetadata?.title,
        thumbnail_url: videoMetadata?.thumbnail,
        updated_at: new Date().toISOString()
      }).eq('id', currentSummaryId);
      setFinalResult(result);
      setStep("results");
      setIsLoading(false);

      // Show notification if user left the page during processing
      if (!pageVisible && requestNotifications) {
        showRequestCompleteNotification(videoMetadata?.title);
      }
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
          await supabase.from('summaries').delete().eq('id', currentSummaryId);
        } catch (refundError) {
          console.error('Failed to refund credit:', refundError);
        }
      }

      // Show appropriate error message based on the error
      if (error.message === 'Failed to create summary record') {
        setFinalResult("Please make sure you're logged in and try again.");
      } else {
        setFinalResult(`Error: ${error.message}`);
      }
      setStep("results");
      setIsLoading(false);
    }
  };
  const goBackToRequest = () => {
    setStep("request");
    setUserRequest("");
    setUrl("");
    setIsLoading(false);
    setStreamingContent("");
    setFinalResult("");
    setVideoMetadata(null);
    setError("");
  };
  const goBackToUrl = () => {
    setStep("url");
    setUrl("");
    setIsLoading(false);
    setStreamingContent("");
    setFinalResult("");
    setVideoMetadata(null);
    setError("");
  };
  const isValidUrl = url.includes("youtube.com") || url.includes("youtu.be");
  return <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h1 className="ohsara-logo text-6xl font-light tracking-tight text-foreground mb-6">Ohsara</h1>
      </div>

      {step === "request" ? <form onSubmit={handleRequestSubmit} className="space-y-6">
          <div className="relative">
            <Textarea placeholder="Ask anything or describe what you need from the video..." value={userRequest} onChange={e => setUserRequest(e.target.value)} className="min-h-20 text-base leading-relaxed resize-none border-0 bg-card/50 rounded-2xl px-6 py-4 pr-16 placeholder:text-muted-foreground/60 focus-visible:ring-1 focus-visible:ring-border focus-visible:ring-offset-0 shadow-sm backdrop-blur-sm" disabled={isLoading} />
            <Button type="submit" disabled={!userRequest.trim() || isLoading} className="absolute right-3 bottom-3 h-10 w-10 p-0 rounded-xl bg-primary/90 hover:bg-primary shadow-sm transition-all duration-200">
              <Play className="h-4 w-4" />
            </Button>
          </div>
        </form> : step === "url" ? <div className="space-y-6">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="sm" onClick={goBackToRequest} className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="text-sm text-muted-foreground">
              Looking for: {userRequest.length > 50 ? userRequest.substring(0, 50) + "..." : userRequest}
            </div>
          </div>

          <form onSubmit={handleUrlSubmit} className="space-y-4">
            <div className="space-y-4">
              <Label className="text-lg font-medium">Paste the YouTube URL</Label>
              <div className="relative">
                <Input type="url" placeholder="https://www.youtube.com/watch?v=..." value={url} onChange={e => setUrl(e.target.value)} className="h-14 text-lg px-6 pr-32 rounded-xl border-2 border-border 
                           focus:border-primary focus:ring-primary focus:ring-2 focus:ring-opacity-20
                           bg-card shadow-subtle transition-all duration-200" disabled={isLoading} />
                
                <Button type="submit" disabled={!isValidUrl || isLoading} className="absolute right-2 top-2 h-10 px-6 rounded-lg bg-primary hover:bg-primary/90 
                           text-primary-foreground font-medium transition-all duration-200
                           disabled:opacity-50 disabled:cursor-not-allowed">
                  <Play className="h-4 w-4 mr-2" />
                  Process
                </Button>
              </div>

              {url && !isValidUrl && <p className="text-sm text-destructive text-center">
                  Please enter a valid YouTube URL
                </p>}
            </div>
          </form>
        </div> : step === "processing" ? <div className="space-y-6">
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-lg font-medium">Processing video...</span>
            </div>
            
            <div className="text-sm text-muted-foreground">
              Extracting transcript and analyzing: {userRequest.length > 60 ? userRequest.substring(0, 60) + "..." : userRequest}
            </div>
            
            {videoMetadata && <div className="bg-card border border-border rounded-lg p-4">
                <img src={videoMetadata.thumbnail} alt="Video thumbnail" className="w-full aspect-video object-cover rounded-lg mb-3" />
                <h3 className="font-semibold text-lg">{videoMetadata.title}</h3>
              </div>}

            {streamingContent && <div className="bg-card border border-border rounded-lg p-6 text-left">
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {streamingContent}
                    <span className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse" />
                  </div>
                </div>
              </div>}
          </div>
        </div> : step === "results" ? <div className="space-y-6">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={goBackToRequest} className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Analyze Another Video
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.open('/history', '_blank')} className="flex items-center gap-2">
              View in History
            </Button>
          </div>

          {videoMetadata && <div className="bg-card border border-border rounded-lg p-4">
              <img src={videoMetadata.thumbnail} alt="Video thumbnail" className="w-full aspect-video object-cover rounded-lg mb-3" />
              <h3 className="font-semibold text-lg">{videoMetadata.title}</h3>
            </div>}

          <div className="bg-background border border-border/50 rounded-lg p-0 shadow-sm overflow-hidden">
            <div className="p-6 space-y-1">
              <div className="chatgpt-output text-foreground/90 leading-relaxed text-left" dangerouslySetInnerHTML={{
            __html: finalResult
              .replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold text-foreground mt-6 mb-3 border-b border-border/30 pb-2">$1</h3>')
              .replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold text-foreground mt-8 mb-4 border-b border-border/30 pb-2">$1</h2>')
              .replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold text-foreground mt-8 mb-5 border-b border-border/30 pb-3">$1</h1>')
              .replace(/\*\*(.*?)\*\*/g, '<strong class="font-medium text-foreground">$1</strong>')
              .replace(/\*(.*?)\*/g, '<em class="italic text-foreground/80">$1</em>')
              .replace(/^[-•] (.*$)/gm, '<div class="flex items-start gap-3 my-2"><span class="text-foreground/60 text-sm mt-1">•</span><span class="flex-1 text-sm leading-relaxed">$1</span></div>')
              .replace(/^(\d+)\. (.*$)/gm, '<div class="flex items-start gap-3 my-2"><span class="text-foreground/60 text-sm mt-1 font-medium">$1.</span><span class="flex-1 text-sm leading-relaxed">$2</span></div>')
              .replace(/\n\n/g, '</p><p class="mb-4 text-sm leading-relaxed text-foreground/90">')
              .replace(/^(?!<[hdl])/gm, '<p class="mb-4 text-sm leading-relaxed text-foreground/90">')
              .replace(/<\/p><p class="mb-4 text-sm leading-relaxed text-foreground\/90">(?=<[hdl])/g, '</p>')
          }} />
            </div>
          </div>
        </div> : null}

      {/* Loading progress bar */}
      {isLoading && <div className="w-full bg-progress-background rounded-full h-1 overflow-hidden">
          <div className="loading-bar w-1/3 animate-pulse" />
        </div>}
    </div>;
}