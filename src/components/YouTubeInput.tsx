import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Loader2 } from "lucide-react";

export function YouTubeInput() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setIsLoading(true);
    
    // TODO: Implement YouTube URL processing
    setTimeout(() => {
      setIsLoading(false);
      console.log("Processing URL:", url);
    }, 2000);
  };

  const isValidUrl = url.includes("youtube.com") || url.includes("youtu.be");

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h1 className="ohsara-logo text-6xl font-light tracking-tight text-foreground mb-6">
          ohsara
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Summarize
              </>
            )}
          </Button>
        </div>

        {url && !isValidUrl && (
          <p className="text-sm text-destructive text-center">
            Please enter a valid YouTube URL
          </p>
        )}
      </form>

      {/* Loading progress bar */}
      {isLoading && (
        <div className="w-full bg-progress-background rounded-full h-1 overflow-hidden">
          <div className="loading-bar w-1/3 animate-pulse" />
        </div>
      )}
    </div>
  );
}