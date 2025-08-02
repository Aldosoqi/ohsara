import { YouTubeInput } from "@/components/YouTubeInput";
import { SuggestionPills } from "@/components/SuggestionPills";

const Index = () => {
  return (
    <div className="min-h-screen flex items-center justify-center px-8">
      <div className="w-full max-w-4xl mx-auto space-y-12">
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
      </div>
    </div>
  );
};

export default Index;
