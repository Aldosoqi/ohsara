import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Play, Loader2, ArrowLeft } from "lucide-react";

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
  const [step, setStep] = useState<"url" | "options">("url");
  const [selectedOption, setSelectedOption] = useState("");
  const [customRequest, setCustomRequest] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUrl || isLoading) return;
    setStep("options");
  };

  const handleAnalysisSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOption) return;

    setIsLoading(true);
    
    // TODO: Implement YouTube URL processing with selected analysis type
    setTimeout(() => {
      setIsLoading(false);
      console.log("Processing URL:", url, "Analysis type:", selectedOption, "Custom request:", customRequest);
    }, 2000);
  };

  const goBack = () => {
    setStep("url");
    setSelectedOption("");
    setCustomRequest("");
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
      ) : (
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
      )}

      {/* Loading progress bar */}
      {isLoading && (
        <div className="w-full bg-progress-background rounded-full h-1 overflow-hidden">
          <div className="loading-bar w-1/3 animate-pulse" />
        </div>
      )}
    </div>
  );
}