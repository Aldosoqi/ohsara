import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Mic, Radio, BookOpen, FileAudio } from "lucide-react";

const contentTypes = [
  { id: "podcast", label: "Podcast Transcript", icon: Mic, description: "Paste your podcast transcript" },
  { id: "article", label: "Long Article", icon: FileText, description: "Analyze lengthy articles or blog posts" },
  { id: "book", label: "Book Chapter", icon: BookOpen, description: "Extract insights from book chapters" },
  { id: "interview", label: "Interview", icon: Radio, description: "Process interview transcripts" },
  { id: "audio", label: "Audio Transcript", icon: FileAudio, description: "Upload audio file transcripts" }
];

const analysisOptions = [
  { id: "summary", label: "Summary", description: "Get a concise overview of the main points" },
  { id: "key-insights", label: "Key Insights", description: "Extract the most valuable insights and learnings" },
  { id: "action-items", label: "Action Items", description: "Identify actionable takeaways and next steps" },
  { id: "themes", label: "Themes & Topics", description: "Discover main themes and recurring topics" },
  { id: "quotes", label: "Notable Quotes", description: "Extract impactful quotes and statements" },
  { id: "custom", label: "Custom Analysis", description: "Specify your own analysis requirements" }
];

export function LongContentInput() {
  const [selectedContentType, setSelectedContentType] = useState("podcast");
  const [content, setContent] = useState("");
  const [selectedAnalysis, setSelectedAnalysis] = useState("");
  const [customRequest, setCustomRequest] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !selectedAnalysis) return;
    
    setIsProcessing(true);
    // TODO: Process content here
    console.log("Processing content:", { selectedContentType, content, selectedAnalysis, customRequest });
    
    // Simulate processing
    setTimeout(() => {
      setIsProcessing(false);
    }, 2000);
  };

  const selectedType = contentTypes.find(type => type.id === selectedContentType);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-light tracking-tight text-foreground mb-4">
          Long Content Analysis
        </h2>
        <p className="text-lg text-muted-foreground">
          Process podcasts, articles, interviews and other long-form content
        </p>
      </div>

      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Content Processor
          </CardTitle>
          <CardDescription>
            Choose your content type and paste your text for AI analysis
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Content Type Selection */}
            <div className="space-y-4">
              <Label className="text-base font-medium">Content Type</Label>
              <Tabs value={selectedContentType} onValueChange={setSelectedContentType}>
                <TabsList className="grid w-full grid-cols-5">
                  {contentTypes.map((type) => (
                    <TabsTrigger 
                      key={type.id} 
                      value={type.id}
                      className="flex flex-col gap-1 h-16 text-xs"
                    >
                      <type.icon className="h-4 w-4" />
                      <span className="hidden sm:inline">{type.label.split(' ')[0]}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
                
                {contentTypes.map((type) => (
                  <TabsContent key={type.id} value={type.id} className="mt-4">
                    <div className="flex items-center gap-3 p-4 bg-accent/30 rounded-lg border">
                      <type.icon className="h-5 w-5 text-primary" />
                      <div>
                        <h4 className="font-medium">{type.label}</h4>
                        <p className="text-sm text-muted-foreground">{type.description}</p>
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            {/* Content Input */}
            <div className="space-y-3">
              <Label htmlFor="content" className="text-base font-medium">
                Paste Your Content
              </Label>
              <Textarea
                id="content"
                placeholder={`Paste your ${selectedType?.label.toLowerCase()} here... (minimum 500 characters recommended for best results)`}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[200px] text-sm leading-relaxed resize-none"
                disabled={isProcessing}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{content.length} characters</span>
                <span>Recommended: 500+ characters</span>
              </div>
            </div>

            {/* Analysis Type Selection */}
            <div className="space-y-4">
              <Label className="text-base font-medium">Analysis Type</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {analysisOptions.map((option) => (
                  <label
                    key={option.id}
                    className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                      selectedAnalysis === option.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50 hover:bg-accent/50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="analysisType"
                      value={option.id}
                      checked={selectedAnalysis === option.id}
                      onChange={(e) => setSelectedAnalysis(e.target.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{option.label}</div>
                      <div className="text-sm text-muted-foreground">{option.description}</div>
                    </div>
                  </label>
                ))}
              </div>

              {selectedAnalysis === "custom" && (
                <div className="mt-4">
                  <Label htmlFor="customAnalysis" className="text-sm font-medium">
                    Describe your analysis requirements:
                  </Label>
                  <Textarea
                    id="customAnalysis"
                    value={customRequest}
                    onChange={(e) => setCustomRequest(e.target.value)}
                    placeholder="E.g., Focus on business strategies mentioned, extract all statistics and data points, identify contradictions..."
                    className="mt-2 min-h-[80px]"
                  />
                </div>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={!content.trim() || content.length < 100 || !selectedAnalysis || isProcessing || (selectedAnalysis === "custom" && !customRequest.trim())}
              className="w-full h-12 text-lg font-medium"
            >
              {isProcessing ? (
                <>
                  <div className="h-5 w-5 mr-2 animate-spin rounded-full border-2 border-background border-t-transparent" />
                  Processing Content...
                </>
              ) : (
                <>
                  <FileText className="h-5 w-5 mr-2" />
                  Analyze Content
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}