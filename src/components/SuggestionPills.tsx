import { Badge } from "@/components/ui/badge";

interface SuggestionPillsProps {
  onSuggestionClick?: (url: string) => void;
}

const suggestions = [
  "Summarize a Lecture",
  "Explain a Tutorial", 
  "Get Key Takeaways",
  "Extract Main Points",
  "Academic Content",
  "Tech Reviews"
];

export const SuggestionPills = ({ onSuggestionClick }: SuggestionPillsProps) => {
  const handleSuggestionClick = (suggestion: string) => {
    onSuggestionClick?.(suggestion);
  };

  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {suggestions.map((suggestion, index) => (
        <Badge
          key={index}
          variant="secondary"
          className="cursor-pointer hover:bg-accent transition-colors"
          onClick={() => handleSuggestionClick(suggestion)}
        >
          {suggestion}
        </Badge>
      ))}
    </div>
  );
};