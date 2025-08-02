const suggestions = [
  "Summarize a Lecture",
  "Explain a Tutorial", 
  "Get Key Takeaways",
  "Extract Main Points",
  "Academic Content",
  "Tech Reviews"
];

export function SuggestionPills() {
  const handleSuggestionClick = (suggestion: string) => {
    // TODO: Implement suggestion handling
    console.log("Suggestion clicked:", suggestion);
  };

  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion}
          onClick={() => handleSuggestionClick(suggestion)}
          className="suggestion-pill"
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}