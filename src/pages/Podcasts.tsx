import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PodcastInput } from "@/components/PodcastInput";
import { useAuth } from "@/hooks/useAuth";

const Podcasts = () => {
  const { user, loading } = useAuth();
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
        <div className="text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Ohsara for Podcasts
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Process podcast transcripts and have intelligent conversations about the content with AI memory
            </p>
          </div>
          <PodcastInput />
        </div>
      </div>
    </div>
  );
};

export default Podcasts;