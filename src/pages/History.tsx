import { useState, useEffect } from "react";
import { Clock, Video, ExternalLink, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface Summary {
  id: string;
  youtube_url: string;
  video_title: string | null;
  thumbnail_url: string | null;
  summary: string;
  created_at: string;
}

const History = () => {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSummary, setSelectedSummary] = useState<Summary | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSummaries = async () => {
      if (!user?.id) return;
      
      setLoading(true);

      try {
        const { data, error } = await supabase
          .from('summaries')
          .select('*')
          .eq('user_id', user.id)
          .not('summary', 'eq', '') // Only get completed summaries
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching summaries:', error);
        } else {
          setSummaries(data || []);
        }
      } catch (error) {
        console.error('Error fetching summaries:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSummaries();
    
    // Set up real-time subscription for new summaries
    const subscription = supabase
      .channel('summaries')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'summaries',
          filter: `user_id=eq.${user?.id}`
        }, 
        () => {
          fetchSummaries();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const openSummary = (summary: Summary) => {
    setSelectedSummary(summary);
  };

  const closeSummary = () => {
    setSelectedSummary(null);
  };

  if (selectedSummary) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Button 
              variant="ghost" 
              onClick={closeSummary}
              className="mb-4"
            >
              ← Back to History
            </Button>
            <div className="flex gap-4 mb-6">
              {selectedSummary.thumbnail_url && (
                <img
                  src={selectedSummary.thumbnail_url}
                  alt="Video thumbnail"
                  className="w-48 h-27 object-cover rounded-lg"
                />
              )}
              <div className="flex-1">
                <h1 className="text-2xl font-semibold text-foreground mb-2">
                  {selectedSummary.video_title || 'YouTube Video'}
                </h1>
                <p className="text-muted-foreground mb-2">
                  {formatDate(selectedSummary.created_at)}
                </p>
                <a
                  href={selectedSummary.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  Watch on YouTube
                </a>
              </div>
            </div>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-8">
            <h2 className="text-xl font-semibold text-foreground mb-6">Summary</h2>
            <div className="prose prose-lg max-w-none text-foreground">
              <div 
                className="formatted-content space-y-4"
                dangerouslySetInnerHTML={{
                  __html: selectedSummary.summary
                    .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold text-foreground mt-6 mb-3">$1</h3>')
                    .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold text-foreground mt-8 mb-4">$1</h2>')
                    .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold text-foreground mt-10 mb-5">$1</h1>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
                    .replace(/^[-•] (.*$)/gm, '<li class="ml-4 mb-1">$1</li>')
                    .replace(/^(\d+)\. (.*$)/gm, '<li class="ml-4 mb-1 list-decimal">$2</li>')
                    .replace(/\n\n/g, '</p><p class="mb-4">')
                    .replace(/^(?!<[h|l|s|e])/gm, '<p class="mb-4">')
                    .replace(/<\/p><p class="mb-4">(?=<[h|l])/g, '</p>')
                }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">History</h1>
          <p className="text-muted-foreground">Your recent YouTube summaries</p>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary rounded-full mb-4">
              <Clock className="h-8 w-8 text-muted-foreground animate-pulse" />
            </div>
            <p className="text-muted-foreground">Loading your summaries...</p>
          </div>
        ) : summaries.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary rounded-full mb-4">
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No summaries yet</h3>
            <p className="text-muted-foreground mb-6">
              Summarize your first video to see it here
            </p>
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Video className="h-4 w-4" />
              <span>Get started by pasting a YouTube URL</span>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {summaries.map((summary) => (
              <div
                key={summary.id}
                className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex gap-6">
                  <div className="flex-shrink-0">
                    <img
                      src={summary.thumbnail_url || 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=400&h=240'}
                      alt="Video thumbnail"
                      className="w-40 h-24 object-cover rounded-lg border border-border"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-lg font-semibold text-foreground line-clamp-2">
                        {summary.video_title || 'YouTube Video'}
                      </h3>
                      <a
                        href={summary.youtube_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 ml-2 p-2 text-muted-foreground hover:text-foreground transition-colors"
                        title="Open original video"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {formatDate(summary.created_at)}
                    </p>
                    <div className="bg-secondary/50 rounded-lg p-4 mb-4">
                      <p className="text-sm text-foreground line-clamp-4">
                        {summary.summary}
                      </p>
                    </div>
                    <Button
                      onClick={() => openSummary(summary)}
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      View Full Summary
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default History;