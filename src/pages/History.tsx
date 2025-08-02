import { Clock, Video } from "lucide-react";

const History = () => {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground mb-2">History</h1>
          <p className="text-muted-foreground">Your recent YouTube summaries</p>
        </div>

        {/* Empty state */}
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
      </div>
    </div>
  );
};

export default History;