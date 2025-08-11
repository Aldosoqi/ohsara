import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, MessagesSquare, Image as ImageIcon, Link2 } from "lucide-react";

export function IntelligentInput() {
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<"url" | "analyzing" | "chat">("url");
  const [isLoading, setIsLoading] = useState(false);
  const [videoMeta, setVideoMeta] = useState<{ title: string; thumbnail?: string; videoId?: string } | null>(null);
  const [visionOutput, setVisionOutput] = useState("");
  const [mappingOutput, setMappingOutput] = useState("");
  const [transcript, setTranscript] = useState<string>("");

  // Chat state
  type Msg = { role: "user" | "assistant"; content: string };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const assistantStreamingRef = useRef<string>("");
  const isValidUrl = useMemo(() => url.includes("youtube.com") || url.includes("youtu.be"), [url]);

  // Auto-start from ?url= query param
  const autoStartRef = useRef(false);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const u = params.get('url') || '';
      if (u && (u.includes('youtube.com') || u.includes('youtu.be'))) {
        setUrl(u);
        autoStartRef.current = true;
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (autoStartRef.current && isValidUrl && step === 'url' && !isLoading) {
      autoStartRef.current = false;
      startAnalysis();
    }
  }, [isValidUrl, step, isLoading]);


  const startAnalysis = async () => {
    if (!isValidUrl || isLoading) return;
    setIsLoading(true);
    setStep("analyzing");
    setVisionOutput("");
    setMappingOutput("");
    setVideoMeta(null);

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    const resp = await fetch(`https://zkoktwjrmmvmwiftxxmf.supabase.co/functions/v1/ohsara-intelligent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inprb2t0d2pybW12bXdpZnR4eG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxNDk5OTQsImV4cCI6MjA2OTcyNTk5NH0.szbLke0RzFR-jdzUB9jrXmUPM2jsYWMrieCRwmRA0Fg'
      },
      body: JSON.stringify({ youtubeUrl: url, mode: 'start' })
    });

    if (!resp.ok || !resp.body) {
      setIsLoading(false);
      setStep("url");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'metadata' && data.videoMetadata) {
            setVideoMeta(data.videoMetadata);
          } else if (data.type === 'vision_chunk' && data.content) {
            setVisionOutput((prev) => prev + data.content);
          } else if (data.type === 'mapping_chunk' && data.content) {
            setMappingOutput((prev) => prev + data.content);
          } else if (data.type === 'ready_for_chat' && data.transcript) {
            setTranscript(data.transcript);
          } else if (data.type === 'complete') {
            setIsLoading(false);
            setStep('chat');
          }
        } catch { /* ignore */ }
      }
    }
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content) return;
    const newMsgs = [...messages, { role: 'user' as const, content }];
    setMessages(newMsgs);
    setInput("");
    assistantStreamingRef.current = "";
    setMessages((cur) => [...cur, { role: 'assistant', content: '' }]);

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;

    const resp = await fetch(`https://zkoktwjrmmvmwiftxxmf.supabase.co/functions/v1/ohsara-intelligent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inprb2t0d2pybW12bXdpZnR4eG1mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQxNDk5OTQsImV4cCI6MjA2OTcyNTk5NH0.szbLke0RzFR-jdzUB9jrXmUPM2jsYWMrieCRwmRA0Fg'
      },
      body: JSON.stringify({ youtubeUrl: url, mode: 'chat', messages: newMsgs, transcript })
    });

    if (!resp.ok || !resp.body) {
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'chat_chunk' && data.content) {
            assistantStreamingRef.current += data.content;
            setMessages((cur) => {
              const copy = [...cur];
              copy[copy.length - 1] = { role: 'assistant', content: assistantStreamingRef.current };
              return copy;
            });
          }
        } catch {}
      }
    }
  };

  // Render helpers
  const renderMarkdown = (text: string) => {
    if (!text) return null;
    const html = text
      .replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold mt-6 mb-3">$1</h3>')
      .replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold mt-8 mb-4">$1</h2>')
      .replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold mt-8 mb-5">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^[-•] (.*$)/gm, '<div class="flex items-start gap-3 my-2"><span class="text-foreground/60 text-sm mt-1">•</span><span class="flex-1 text-sm leading-relaxed">$1</span></div>')
      .replace(/^(\d+)\. (.*$)/gm, '<div class="flex items-start gap-3 my-2"><span class="text-foreground/60 text-sm mt-1 font-medium">$1.</span><span class="flex-1 text-sm leading-relaxed">$2</span></div>')
      .replace(/\n\n/g, '</p><p class="mb-4 text-sm leading-relaxed">')
      .replace(/^(?!<[hdl])/gm, '<p class="mb-4 text-sm leading-relaxed">')
      .replace(/<p class=\"mb-4 text-sm leading-relaxed\">(?=<[hdl])/g, '');
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-card/50 border-border/50">
        {step === 'url' && (
          <div className="space-y-4">
            <Label className="text-lg font-medium flex items-center gap-2"><Link2 className="w-4 h-4"/> Paste the YouTube URL</Label>
            <div className="relative">
              <Input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-12 rounded-xl pr-36"
              />
              <Button
                onClick={startAnalysis}
                disabled={!isValidUrl || isLoading}
                className="absolute right-2 top-2 h-8 px-4 rounded-lg"
              >
                <Sparkles className="w-4 h-4 mr-2"/> Analyze
              </Button>
            </div>
            {!isValidUrl && url && (
              <p className="text-sm text-destructive">Please enter a valid YouTube URL</p>
            )}
          </div>
        )}

        {step === 'analyzing' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin"/> Processing with 5 credits...
            </div>

            {videoMeta && (
              <div className="bg-background rounded-lg overflow-hidden border border-border">
                {videoMeta.thumbnail && (
                  <img src={videoMeta.thumbnail} alt="Video thumbnail" className="w-full aspect-video object-cover" />
                )}
                <div className="p-4">
                  <h3 className="font-semibold">{videoMeta.title}</h3>
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 font-medium mb-2"><ImageIcon className="w-4 h-4"/> Thumbnail & Title Analysis</div>
                <div className="prose prose-sm max-w-none">
                  {renderMarkdown(visionOutput || "")}
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="font-medium mb-2">Deep Content Mapping</div>
                <div className="prose prose-sm max-w-none">
                  {renderMarkdown(mappingOutput || "")}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'chat' && (
          <div className="space-y-6">
            {videoMeta && (
              <div className="bg-background rounded-lg overflow-hidden border border-border">
                {videoMeta.thumbnail && (
                  <img src={videoMeta.thumbnail} alt="Video thumbnail" className="w-full aspect-video object-cover" />
                )}
                <div className="p-4">
                  <h3 className="font-semibold">{videoMeta.title}</h3>
                </div>
              </div>
            )}

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 font-medium mb-3"><MessagesSquare className="w-4 h-4"/> Chat with the video</div>
              <div className="space-y-4 max-h-[48vh] overflow-auto pr-2">
                {messages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-start gap-3 max-w-[80%] rounded-2xl px-4 py-3 border ${m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      <div className="prose prose-sm max-w-none">{renderMarkdown(m.content)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about details, timestamps, or request a summary..."
                  className="min-h-[56px]"
                />
                <Button onClick={sendMessage} disabled={!input.trim()} className="h-[56px] self-end">Send</Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
