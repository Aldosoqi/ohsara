import { useEffect } from "react";

export default function Intelligent() {
  useEffect(() => {
    document.title = "Ohsara Intelligent – Smart Video Insight Assistant";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Analyze YouTube thumbnails, titles, and transcripts. Map clickbait promises to exact moments, then chat with the video.');
    } else {
      const m = document.createElement('meta');
      m.name = 'description';
      m.content = 'Analyze YouTube thumbnails, titles, and transcripts. Map clickbait promises to exact moments, then chat with the video.';
      document.head.appendChild(m);
    }
  }, []);

  return (
    <main className="container mx-auto p-6 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-foreground">Ohsara Intelligent — Smart Video Insight Assistant</h1>
        <p className="text-muted-foreground mt-2">Paste a YouTube URL. We’ll analyze the thumbnail and title, map promises to transcript moments, then let you chat with the whole video.</p>
      </header>
      <section>
        <IntelligentInput />
      </section>
    </main>
  );
}

import { IntelligentInput } from "@/components/IntelligentInput";
