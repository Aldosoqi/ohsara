import { useState, useEffect } from "react";
import { Clock, Video, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  const { user } = useAuth();

  useEffect(() => {
    const fetchSummaries = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('summaries')
          .select('*')
          .eq('user_id', user.id)
          .neq('summary', '') // Only get completed summaries
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
                <div className="flex gap-4">
                  {summary.thumbnail_url && (
                    <div className="flex-shrink-0">
                      <img
                        src={summary.thumbnail_url}
                        alt="Video thumbnail"
                        className="w-32 h-18 object-cover rounded-lg"
                      />
                    </div>
                  )}
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
                    <div className="bg-secondary/50 rounded-lg p-4">
                      <p className="text-sm text-foreground line-clamp-4">
                        {summary.summary}
                      </p>
                    </div>
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