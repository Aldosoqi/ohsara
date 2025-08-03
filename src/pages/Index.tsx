import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { YouTubeInput } from "@/components/YouTubeInput";
import { LongContentInput } from "@/components/LongContentInput";
import { SuggestionPills } from "@/components/SuggestionPills";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
const Index = () => {
  const {
    user,
    loading
  } = useAuth();
  const navigate = useNavigate();
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
      <div className="w-full max-w-6xl mx-auto space-y-12">
        {/* Main input section with tabs */}
        <div className="text-center space-y-8">
          <div className="text-center mb-8">
            <h1 className="ohsara-logo text-6xl font-light tracking-tight text-foreground mb-6">
              ohsara
            </h1>
          </div>

          <Tabs defaultValue="youtube" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
              <TabsTrigger value="youtube">YouTube Videos</TabsTrigger>
              <TabsTrigger value="content">Long Content</TabsTrigger>
            </TabsList>
            
            <TabsContent value="youtube" className="mt-8">
              <YouTubeInput />
            </TabsContent>
            
            <TabsContent value="content" className="mt-8">
              <LongContentInput />
            </TabsContent>
          </Tabs>
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
          
        </div>
      </div>
    </div>;
};
export default Index;