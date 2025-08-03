import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { YouTubeInput } from "@/components/YouTubeInput";
import { SuggestionPills } from "@/components/SuggestionPills";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { Coins } from "lucide-react";

const Index = () => {
  const { user, loading, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to auth
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-8">
      <div className="w-full max-w-4xl mx-auto space-y-12">
        {/* Credits section */}
        <div className="flex justify-center">
          <Card className="bg-card border-border">
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <div className="inline-flex items-center justify-center w-8 h-8 bg-primary/10 rounded-full">
                <Coins className="h-4 w-4 text-primary" />
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Credits: </span>
                <span className="font-semibold text-foreground">{profile?.credits || 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main input section */}
        <div className="text-center space-y-8">
          <YouTubeInput />
          
          {/* Suggestion pills */}
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Try these examples:</p>
            <SuggestionPills />
          </div>
        </div>

        {/* Feature highlights */}
        <div className="grid md:grid-cols-3 gap-8 pt-16 border-t border-border">
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
        </div>

        {/* Sign In Link for testing */}
        <div className="text-center mt-8">
          <Button
            variant="outline"
            onClick={() => navigate("/auth")}
            className="text-sm"
          >
            Not you? Sign in with different account
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
