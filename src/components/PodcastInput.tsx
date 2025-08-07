import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Send, Upload, FileText, Mic } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Step = "upload" | "processing" | "chat";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export const PodcastInput = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userMessage, setUserMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [podcastTitle, setPodcastTitle] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const transcriptSessionRef = useRef<string | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isTyping]);

  const handleTranscriptUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setTranscript(content);
        setPodcastTitle(file.name.replace(/\.[^/.]+$/, ""));
      };
      reader.readAsText(file);
    }
  };

  const handleTranscriptSubmit = async () => {
    if (!transcript.trim()) {
      toast({
        title: "Error",
        description: "Please provide a transcript",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Store transcript in session for memory
      transcriptSessionRef.current = transcript;
      
      // Add initial system message about the transcript
      const initialMessage: ChatMessage = {
        role: "assistant",
        content: `I've successfully processed the podcast transcript for "${podcastTitle || 'your podcast'}". The transcript contains ${transcript.split(' ').length} words. I now have the full context in memory and can answer any questions about the content. What would you like to know?`,
        timestamp: new Date(),
      };
      
      setChatMessages([initialMessage]);
      setStep("chat");
    } catch (error) {
      console.error("Error processing transcript:", error);
      toast({
        title: "Error",
        description: "Failed to process transcript",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = async () => {
    if (!userMessage.trim() || !transcriptSessionRef.current) return;

    const newUserMessage: ChatMessage = {
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };

    setChatMessages(prev => [...prev, newUserMessage]);
    setUserMessage("");
    setIsTyping(true);

    try {
      // Prepare context with transcript and chat history
      const context = {
        transcript: transcriptSessionRef.current,
        chatHistory: chatMessages,
        currentQuery: userMessage,
      };

      const { data, error } = await supabase.functions.invoke('process-podcast-chat', {
        body: context,
      });

      if (error) throw error;

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      };

      setChatMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error in chat:", error);
      toast({
        title: "Error",
        description: "Failed to get response",
        variant: "destructive",
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
    }
  };

  const goBackToUpload = () => {
    setStep("upload");
    setTranscript("");
    setChatMessages([]);
    setPodcastTitle("");
    transcriptSessionRef.current = null;
  };

  const formatMessage = (content: string) => {
    // Split by double newlines to create paragraphs
    const paragraphs = content.split('\n\n');
    
    return paragraphs.map((paragraph, index) => {
      // Handle lists
      if (paragraph.includes('\n- ') || paragraph.includes('\n• ')) {
        const lines = paragraph.split('\n');
        const beforeList = lines[0];
        const listItems = lines.slice(1).filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'));
        
        return (
          <div key={index} className="mb-4">
            {beforeList && <p className="mb-2">{beforeList}</p>}
            <ul className="list-disc list-inside space-y-1 ml-4">
              {listItems.map((item, itemIndex) => (
                <li key={itemIndex} className="text-foreground">
                  {item.replace(/^[-•]\s*/, '')}
                </li>
              ))}
            </ul>
          </div>
        );
      }
      
      // Handle numbered lists
      if (/^\d+\./.test(paragraph.trim())) {
        const lines = paragraph.split('\n');
        return (
          <ol key={index} className="list-decimal list-inside space-y-1 ml-4 mb-4">
            {lines.map((line, itemIndex) => (
              <li key={itemIndex} className="text-foreground">
                {line.replace(/^\d+\.\s*/, '')}
              </li>
            ))}
          </ol>
        );
      }
      
      // Regular paragraphs
      return (
        <p key={index} className="mb-4 text-foreground leading-relaxed">
          {paragraph}
        </p>
      );
    });
  };

  if (step === "upload") {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full">
              <Mic className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Upload Podcast Transcript</h2>
              <p className="text-muted-foreground">
                Upload a transcript file or paste the content directly
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Upload Transcript File
              </label>
              <div className="flex items-center gap-4">
                <Input
                  type="file"
                  accept=".txt,.md,.srt"
                  onChange={handleTranscriptUpload}
                  className="flex-1"
                />
                <Upload className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Supports .txt, .md, .srt files
              </p>
            </div>

            <div className="text-center text-muted-foreground">or</div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Paste Transcript Content
              </label>
              <Textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Paste your podcast transcript here..."
                className="min-h-[200px] resize-none"
              />
            </div>

            {transcript && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Podcast Title (Optional)
                </label>
                <Input
                  value={podcastTitle}
                  onChange={(e) => setPodcastTitle(e.target.value)}
                  placeholder="Enter podcast title..."
                />
              </div>
            )}

            <Button
              onClick={handleTranscriptSubmit}
              disabled={!transcript.trim() || loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Processing...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Start Chat Session
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "chat") {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={goBackToUpload}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            New Transcript
          </Button>
          <div className="text-center">
            <h2 className="text-lg font-semibold">
              {podcastTitle || 'Podcast Chat'}
            </h2>
            <p className="text-sm text-muted-foreground">
              AI has full transcript in memory
            </p>
          </div>
          <div /> {/* Spacer for centering */}
        </div>

        <Card className="h-[600px] flex flex-col">
          <CardContent className="flex-1 p-6 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {chatMessages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-lg p-4 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted border border-border"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <div className="text-left">
                        {formatMessage(message.content)}
                      </div>
                    ) : (
                      <p className="text-left">{message.content}</p>
                    )}
                    <div className="text-xs opacity-70 mt-2">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-muted border border-border rounded-lg p-4">
                    <div className="flex items-center space-x-2">
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                        <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      </div>
                      <span className="text-sm text-muted-foreground">AI is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex gap-2">
              <Textarea
                value={userMessage}
                onChange={(e) => setUserMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask anything about the podcast..."
                className="flex-1 min-h-[50px] max-h-[120px] resize-none"
                disabled={isTyping}
              />
              <Button
                onClick={handleChatSubmit}
                disabled={!userMessage.trim() || isTyping}
                size="icon"
                className="h-[50px] w-[50px]"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
};