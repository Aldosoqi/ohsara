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
const Index = () => {
  const { user, loading, refreshProfile } = useAuth();
  const {
    homepageWidgets
  } = useSettings();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<"url" | "analyzing" | "ready">("url");
  const [isLoading, setIsLoading] = useState(false);
  const [videoData, setVideoData] = useState<{
    title: string;
    thumbnail: string;
    analysis: string;
    extractedContent: string;
    fullTranscript: any[];
  } | null>(null);
  type Msg = { role: "user" | "assistant"; content: string };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const assistantStreamingRef = useRef<string>("");
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
                      body: JSON.stringify({ url })
                    });
                    const data = await resp.json();
                    if (!resp.ok) throw new Error(data?.error || 'Failed to process video');

                    setVideoData({
                      title: data.title,
                      thumbnail: data.thumbnail,
                      analysis: data.analysis,
                      extractedContent: data.extractedContent,
                      fullTranscript: data.fullTranscript
                    });
                    setStep("ready");
                    toast({ title: "4 credits used", description: "Title & thumbnail analysis completed." });
                    await refreshProfile();
                  } catch (e: any) {
                    console.error(e);
                    toast({ title: "Analysis failed", description: e?.message || "Please check your credits and try again.", variant: "destructive" });
                    setStep("url");
                  } finally {
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
            <div className="mt-6 text-sm text-muted-foreground animate-pulse">
              🎬 Fetching transcript → 🔍 Analyzing video → ✂️ Preparing insights...
            </div>
          )}

          {step === 'ready' && videoData && (
            <div className="mt-8 space-y-6">
              {/* Video Info */}
              <div className="border rounded-lg overflow-hidden bg-card">
                <img 
                  src={videoData.thumbnail} 
                  alt="Video thumbnail" 
                  className="w-full aspect-video object-cover"
                />
                <div className="p-4">
                  <h3 className="font-semibold text-lg">{videoData.title}</h3>
                </div>
              </div>

              <div className="border rounded-lg p-4 bg-card">
                <h4 className="font-medium mb-2 text-primary">📊 Video analysis</h4>
                <article dir="ltr" className="prose prose-sm max-w-none text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{videoData.analysis}</ReactMarkdown>
                </article>
              </div>

              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-3 text-primary">📝 Extracted Key Content</h4>
                <article dir="ltr" className="prose prose-sm max-w-none text-foreground">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{videoData.extractedContent}</ReactMarkdown>
                </article>
              </div>

              {/* Chat Interface */}
              <div className="border rounded-lg p-4 bg-muted/20">
                <h4 className="font-medium mb-3 text-primary">💬 Chat for more details</h4>
                <div className="space-y-3 max-h-[40vh] overflow-auto pr-2">
                  {messages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex items-start gap-3 max-w-[80%] rounded-2xl px-4 py-3 border ${
                        m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                      }`}>
                        {m.role === 'assistant' && <Bot className="w-4 h-4 mt-1 opacity-70" />}
                        <div dir="ltr" className="prose prose-sm max-w-none text-foreground">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        </div>
                        {m.role === 'user' && <User className="w-4 h-4 mt-1 opacity-90" />}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask for more details, clarification, or deeper insights..."
                    className="min-h-[50px] text-sm"
                  />
                  <Button
                    onClick={async () => {
                      const content = input.trim();
                      if (!content) return;
                      const newMsgs = [...messages, { role: 'user' as const, content }];
                      setMessages(newMsgs);
                      setInput("");
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
                            extractedContent: videoData.extractedContent,
                            fullTranscript: videoData.fullTranscript,
                            messages: newMsgs
                          })
                        });
                        const data = await resp.json();
                        const reply = data?.content || 'No response available';
                        setMessages((cur) => [...cur, { role: 'assistant', content: reply }]);
                        toast({ title: "0.5 credit used", description: "Chat message processed." });
                        await refreshProfile();
                      } catch (e) {
                        console.error(e);
                        setMessages((cur) => [...cur, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
                      }
                    }}
                    disabled={!input.trim()}
                    className="h-[50px] self-end px-6"
                  >Send</Button>
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