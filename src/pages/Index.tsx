import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { SuggestionPills } from "@/components/SuggestionPills";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// Helper function to format Q&A text with bold questions
const formatQAText = (text: string) => {
  // Bold entire question from Q: until A: or end of line
  return text.replace(/Q: ([^A]*?)(?=A:|$)/gm, "**Q: $1**");
};
const Index = () => {
  const { user, loading, refreshProfile } = useAuth();
  const {
    homepageWidgets,
    responseLanguage,
  } = useSettings();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<"url" | "analyzing" | "ready">("url");
  const [isLoading, setIsLoading] = useState(false);
  const [analyzingStageIndex, setAnalyzingStageIndex] = useState(0);
  const analyzingStatuses = [
    "Fetching the video...",
    "Analyzing thumbnail and title...",
    "All done!"
  ];
  const [videoData, setVideoData] = useState<{
    title: string;
    thumbnail: string;
    analysis: string;
    fullTranscript: any[];
  } | null>(null);
  const [streamingAnalysis, setStreamingAnalysis] = useState("");
  const analysisQueueRef = useRef<string[]>([]);
  const analysisProcessingRef = useRef(false);

  const processAnalysisQueue = () => {
    if (analysisProcessingRef.current) return;
    analysisProcessingRef.current = true;

    const process = () => {
      const next = analysisQueueRef.current.shift();
      if (next !== undefined) {
        setStreamingAnalysis((prev) => prev + next);
        setTimeout(process, 35);
      } else {
        analysisProcessingRef.current = false;
      }
    };

    process();
  };
  type Msg = { role: "user" | "assistant"; content: string };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>;
  }
  if (!user) {
    return null; // Will redirect to auth
  }
  return <div className="min-h-screen flex items-center justify-center px-8">
      <div className="w-full max-w-4xl mx-auto space-y-12">
        {/* Main input section */}
        <div className="text-center space-y-8">
          <h1 className="ohsara-logo text-6xl font-bold">Ohsara</h1>
          <div className="space-y-4">
            <label className="text-lg font-medium">Paste YouTube URL</label>
            <div className="relative max-w-2xl mx-auto">
              <Input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-12 pr-28"
                autoFocus
                aria-label="YouTube URL"
              />
              <Button
                onClick={async () => {
                  if (!(url.includes("youtube.com") || url.includes("youtu.be"))) return;
                  setIsLoading(true);
                  setStep("analyzing");
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const accessToken = session?.access_token;

                    const resp = await fetch(`https://zkoktwjrmmvmwiftxxmf.supabase.co/functions/v1/fetch-youtube-transcript`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inprb2t0d2pybW12bXdpZnR4eG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxNDk5OTQsImV4cCI6MjA2OTcyNTk5NH0.szbLke0RzFR-jdzUB9jrXmUPM2jsYWMrieCRwmRA0Fg'
                      },
                      body: JSON.stringify({ url, responseLanguage })
                    });

                    if (!resp.ok) throw new Error('Failed to process video');

                    // Handle streaming response
                    const reader = resp.body?.getReader();
                    if (!reader) throw new Error('No response stream');

                    analysisQueueRef.current = [];
                    analysisProcessingRef.current = false;
                    setStreamingAnalysis("");
                    console.log('🎬 Starting to read analysis stream...');
                    
                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) {
                        console.log('🎬 Stream reading completed');
                        break;
                      }
                      
                      const chunk = new TextDecoder().decode(value);
                      const lines = chunk.split('\n');
                      
                      for (const line of lines) {
                        if (line.startsWith('data: ')) {
                          const data = line.slice(6);
                          if (data === '[DONE]') continue;
                          
                          try {
                            const parsed = JSON.parse(data);
                            console.log('🎬 Received streaming data:', parsed.type);
                            if (parsed.type === 'analysis_chunk') {
                              analysisQueueRef.current.push(...parsed.content.split(/(\s+)/));
                              processAnalysisQueue();
                            } else if (parsed.type === 'analysis_complete') {
                              console.log('🎬 Analysis complete! Setting video data and changing to ready state');
                              setVideoData({
                                title: parsed.title,
                                thumbnail: parsed.thumbnail,
                                analysis: parsed.analysis,
                                fullTranscript: parsed.fullTranscript
                              });
                              setStep("ready");
                              toast({ title: "4 credits used", description: "Title & thumbnail analysis completed." });
                              await refreshProfile();
                            }
                          } catch (e) {
                            console.error('🎬 Failed to parse streaming data:', e);
                          }
                        }
                      }
                    }
                  } catch (e: any) {
                    console.error('🎬 Analysis error:', e);
                    toast({ title: "Analysis failed", description: e?.message || "Please check your credits and try again.", variant: "destructive" });
                    setStep("url");
                  } finally {
                    console.log('🎬 Analysis process finished, current step:', step);
                    setIsLoading(false);
                  }
                }}
                disabled={!(url.includes("youtube.com") || url.includes("youtu.be")) || isLoading}
                className="absolute right-2 top-2 h-8 px-4"
              >
                {isLoading ? 'Working…' : 'Go'}
              </Button>
            </div>
          </div>

          {step === 'analyzing' && (
            <div className="mt-6 space-y-4">
              <div className="text-sm text-muted-foreground animate-pulse">
                🎬 Fetching transcript → 🔍 Analyzing video → ✂️ Preparing insights...
              </div>
              {streamingAnalysis && (
                <div className="border rounded-lg p-6 bg-card shadow-md">
                  <h4 className="font-semibold mb-4 text-primary text-lg flex items-center gap-2">
                    📊 Thumbnail & Title Insights
                  </h4>
                  <article dir="ltr" className="prose max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatQAText(streamingAnalysis)}</ReactMarkdown>
                  </article>
                </div>
              )}
            </div>
          )}

          {step === 'ready' && videoData && (
            <div className="mt-8 space-y-6">
              {/* Video Info */}
              <div className="border rounded-lg overflow-hidden bg-card">
                <img 
                  src={videoData.thumbnail} 
                  alt={`Thumbnail of ${videoData.title}`} 
                  className="w-full aspect-video object-cover"
                />
                <div className="p-4">
                  <h3 className="font-semibold text-lg">{videoData.title}</h3>
                </div>
              </div>

              <div className="border rounded-lg p-6 bg-card shadow-md">
                <h4 className="font-semibold mb-4 text-primary text-lg flex items-center gap-2">
                  📊 Thumbnail & Title Insights
                </h4>
                <article dir="ltr" className="prose max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatQAText(videoData.analysis)}</ReactMarkdown>
                </article>
              </div>

              {/* Chat Interface */}
              <div className="border rounded-lg p-6 bg-card shadow-md">
                <h4 className="font-semibold mb-4 text-primary text-lg flex items-center gap-2">
                  💬 Chat for more details
                </h4>
                
                {/* Chat Messages */}
                <div className="space-y-4 min-h-[200px] max-h-[60vh] overflow-auto mb-4 p-2">
                  {messages.length === 0 && (
                    <div className="text-center text-muted-foreground py-8">
                      <p className="text-sm">Ask any question about the video content...</p>
                    </div>
                  )}
                  
                  {messages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex items-start gap-3 max-w-[85%] rounded-xl px-4 py-3 ${
                        m.role === 'user' 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-secondary border border-border'
                      }`}>
                        {m.role === 'assistant' && <Bot className="w-5 h-5 mt-0.5 opacity-70 flex-shrink-0" />}
                        <div className={`prose prose-sm max-w-none ${m.role === 'user' ? 'text-primary-foreground' : 'text-foreground'}`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatQAText(m.content)}</ReactMarkdown>
                        </div>
                        {m.role === 'user' && <User className="w-5 h-5 mt-0.5 opacity-90 flex-shrink-0" />}
                      </div>
                    </div>
                  ))}
                  
                  {isChatLoading && streamingMessage && (
                    <div className="flex justify-start">
                      <div className="flex items-start gap-3 max-w-[85%] rounded-xl px-4 py-3 bg-secondary border border-border">
                        <Bot className="w-5 h-5 mt-0.5 opacity-70 flex-shrink-0" />
                        <div className="prose prose-sm max-w-none text-foreground">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{formatQAText(streamingMessage)}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {isChatLoading && !streamingMessage && (
                    <div className="flex justify-start">
                      <div className="flex items-start gap-3 max-w-[85%] rounded-xl px-4 py-3 bg-secondary border border-border">
                        <Bot className="w-5 h-5 mt-0.5 opacity-70 flex-shrink-0" />
                        <div className="text-muted-foreground text-sm">
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-current rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                            <div className="w-2 h-2 bg-current rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Chat Input */}
                <div className="flex gap-3 border-t border-border pt-4">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask for more details, clarification, or deeper insights..."
                    className="min-h-[60px] resize-none text-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        document.getElementById('send-button')?.click();
                      }
                    }}
                  />
                  <Button
                    id="send-button"
                    onClick={async () => {
                      const content = input.trim();
                      if (!content) return;
                      const newMsgs = [...messages, { role: 'user' as const, content }];
                      setMessages(newMsgs);
                      setInput("");
                      setIsChatLoading(true);
                      setStreamingMessage("");
                      
                      try {
                        const { data: { session } } = await supabase.auth.getSession();
                        const accessToken = session?.access_token;
                        const resp = await fetch(`https://zkoktwjrmmvmwiftxxmf.supabase.co/functions/v1/youtube-chat`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${accessToken}`,
                            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inprb2t0d2pybW12bXdpZnR4eG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxNDk5OTQsImV4cCI6MjA2OTcyNTk5NH0.szbLke0RzFR-jdzUB9jrXmUPM2jsYWMrieCRwmRA0Fg'
                          },
                          body: JSON.stringify({
                            fullTranscript: videoData.fullTranscript,
                            messages: newMsgs,
                            responseLanguage
                          })
                        });

                        if (!resp.ok) throw new Error('Chat request failed');

                        // Handle streaming response
                        const reader = resp.body?.getReader();
                        if (!reader) throw new Error('No response stream');
                        
                        while (true) {
                          const { done, value } = await reader.read();
                          if (done) break;
                          
                          const chunk = new TextDecoder().decode(value);
                          const lines = chunk.split('\n');
                          
                          for (const line of lines) {
                            if (line.startsWith('data: ')) {
                              const data = line.slice(6);
                              if (data === '[DONE]') continue;
                              
                              try {
                                const parsed = JSON.parse(data);
                                if (parsed.type === 'chat_chunk') {
                                  setStreamingMessage(prev => prev + parsed.content);
                                } else if (parsed.type === 'chat_complete') {
                                  setMessages((cur) => [...cur, { role: 'assistant', content: parsed.reply }]);
                                  setStreamingMessage("");
                                  setIsChatLoading(false);
                                  toast({ title: "0.5 credit used", description: "Chat message processed." });
                                  await refreshProfile();
                                }
                              } catch (e) {
                                // Skip invalid JSON
                              }
                            }
                          }
                        }
                      } catch (e) {
                        console.error(e);
                        setMessages((cur) => [...cur, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
                        setIsChatLoading(false);
                        setStreamingMessage("");
                      }
                    }}
                    disabled={!input.trim() || isChatLoading}
                    className="h-[60px] self-end px-6 min-w-[80px]"
                  >
                    {isChatLoading ? (
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      'Send'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          {homepageWidgets && <div className="mt-8 space-y-6">
              <div>
                <h3 className="text-lg font-medium text-foreground mb-4">Popular requests</h3>
                <SuggestionPills />
              </div>
              
              <div className="text-center text-sm text-muted-foreground">
                <p>Get all what you need from any YouTube video in seconds</p>
              </div>
            </div>}
        </div>

        {/* Feature highlights */}
        {homepageWidgets && <div className="grid md:grid-cols-3 gap-8 pt-16 border-t border-border">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full">
                <span className="text-2xl">⚡</span>
              </div>
              <h3 className="font-semibold text-foreground">Lightning Fast</h3>
              <p className="text-sm text-muted-foreground">
                Get comprehensive summaries in seconds, not minutes
              </p>
            </div>
            
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full">
                <span className="text-2xl">🧠</span>
              </div>
              <h3 className="font-semibold text-foreground">AI-Powered</h3>
              <p className="text-sm text-muted-foreground">
                Advanced algorithms extract key insights and takeaways
              </p>
            </div>
            
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full">
                <span className="text-2xl">📝</span>
              </div>
              <h3 className="font-semibold text-foreground">Clean Format</h3>
              <p className="text-sm text-muted-foreground">
                Beautifully formatted summaries that are easy to read
              </p>
            </div>
          </div>}
      </div>
    </div>;
};
export default Index;