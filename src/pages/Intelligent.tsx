import { useEffect } from "react";

export default function Intelligent() {
  useEffect(() => {
    document.title = "Ohsara – YouTube Expectation Extractor";
    const metaDesc = document.querySelector('meta[name="description"]');
    const content = 'Paste a YouTube URL. We infer your expectation from thumbnail and title, then extract the exact transcript moments that answer it.';
    if (metaDesc) {
      metaDesc.setAttribute('content', content);
    } else {
      const m = document.createElement('meta');
      m.name = 'description';
      m.content = content;
      document.head.appendChild(m);
    }
  }, []);

  return (
    <main className="container mx-auto p-6 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold text-foreground">YouTube Expectation Extractor — Ohsara Intelligent</h1>
        <p className="text-muted-foreground mt-2">Paste a YouTube URL. We read the thumbnail and title to understand what you expect, then extract the exact transcript parts that satisfy that expectation. Chat if you want more.</p>
      </header>
      <section>
        <IntelligentInput />
      </section>
    </main>
  );
}

import { IntelligentInput } from "@/components/IntelligentInput";
