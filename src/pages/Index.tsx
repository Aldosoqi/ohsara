import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { SuggestionPills } from "@/components/SuggestionPills";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
const Index = () => {
  const {
    user,
    loading
  } = useAuth();
  const {
    homepageWidgets
  } = useSettings();
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
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
          <div className="space-y-4">
            <label className="text-lg font-medium">Paste YouTube URL</label>
            <div className="relative max-w-2xl mx-auto">
              <Input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-12 pr-28"
              />
              <Button
                onClick={() => navigate(`/intelligent?url=${encodeURIComponent(url)}`)}
                disabled={!(url.includes("youtube.com") || url.includes("youtu.be"))}
                className="absolute right-2 top-2 h-8 px-4"
              >
                Go
              </Button>
            </div>
          </div>
          
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