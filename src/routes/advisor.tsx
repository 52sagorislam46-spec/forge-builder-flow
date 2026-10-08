import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getBuildSuggestions } from "@/lib/advisor.functions";

export const Route = createFileRoute("/advisor")({
  head: () => ({
    meta: [
      { title: "Fly — AI Build Advisor" },
      { name: "description", content: "Describe your build or project and get AI-powered improvement suggestions." },
      { property: "og:title", content: "Fly — AI Build Advisor" },
      { property: "og:description", content: "Describe your build or project and get AI-powered improvement suggestions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Advisor,
});

function Advisor() {
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    setLoading(true);
    setError("");
    setResult("");
    try {
      const r = await getBuildSuggestions({ data: { description: desc } });
      if (r.ok) setResult(r.text);
      else setError(r.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> AI Build Advisor
          </h1>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">← Home</Link>
        </div>
        <p className="text-sm text-muted-foreground">
          আপনার বিল্ড বা প্রজেক্টের বিবরণ লিখুন — AI উন্নতির পরামর্শ দেবে।
        </p>
        <Textarea
          rows={8}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="যেমন: React দিয়ে একটি সোশ্যাল অ্যাপ বানাচ্ছি, পোস্ট, চ্যাট ও স্টোরি আছে..."
        />
        <Button onClick={submit} disabled={loading || desc.trim().length < 10} className="w-full">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> ভাবছে...</> : "পরামর্শ নিন"}
        </Button>
        {error && <div className="rounded-md border border-destructive/50 p-3 text-sm text-destructive">{error}</div>}
        {result && (
          <div className="rounded-lg border bg-card p-4 text-sm whitespace-pre-wrap leading-relaxed">{result}</div>
        )}
      </div>
    </div>
  );
}
