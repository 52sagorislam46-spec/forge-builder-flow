import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ComponentType } from "react";
import ReactMarkdown from "react-markdown";
import { Bird, Camera, Carrot, Fish, ImagePlus, Loader2, Milk, RotateCcw, Send, Mic, Sprout, TreePine, X } from "lucide-react";

export const Route = createFileRoute("/agro")({
  head: () => ({
    meta: [
      { title: "Fly Agro — কৃষকের বন্ধু | ছবি তুলে রোগ নির্ণয়" },
      { name: "description", content: "ধান, ফসল, গাছ, পশু-পাখি ও মাছের ছবি তুলে রোগ শনাক্ত করুন এবং প্রতিকার ও ঔষধের পরামর্শ নিন সহজ বাংলায়।" },
      { property: "og:title", content: "Fly Agro — কৃষকের বন্ধু" },
      { property: "og:description", content: "ছবি তুলে ফসল, পশু-পাখি ও মাছের রোগ নির্ণয় ও সমাধান সহজ বাংলায়।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
  const max = 1280;
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", 0.85);
}

type Category = { id: string; Icon: ComponentType<{ className?: string }>; label: string; hint: string };

const categories: Category[] = [
  { id: "paddy", Icon: Sprout, label: "ধান পাতা", hint: "ধান গাছের পাতা, কান্ড ও দাগ" },
  { id: "cattle", Icon: Milk, label: "গরু-ছাগল", hint: "গরু, মহিষ, ছাগল ও ভেড়া" },
  { id: "poultry", Icon: Bird, label: "হাঁস-মুরগি", hint: "হাঁস, মুরগি, কুকুটনা ও বতক" },
  { id: "fish", Icon: Fish, label: "মাছ", hint: "মাছ, চাঙ ও পুকুরের পানি" },
  { id: "veg", Icon: Carrot, label: "সবজি", hint: "টমেটো, বেগুন, লঙ্কা ও পাতা সবজি" },
  { id: "fruit", Icon: TreePine, label: "ফলের গাছ", hint: "আম, কাঁঠাল, লিচু ও পেঁপে" },
];

function Index() {
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chat, setChat] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [follow, setFollow] = useState("");
  const [listening, setListening] = useState(false);

  const [voiceSend, setVoiceSend] = useState(false);
  const listen = (set: (t: string) => void) => {
    const W = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) { setError("এই ডিভাইসে ভয়েস ইনপুট সাপোর্ট করে না, লিখে প্রশ্ন করুন।"); return; }
    const r = new SR();
    r.lang = "bn-BD"; r.interimResults = false;
    let heard = false;
    r.onresult = (e: any) => { const t = e.results[0][0].transcript as string; if (t.trim()) { heard = true; set(t); } };
    r.onend = () => { setListening(false); if (heard) setVoiceSend(true); };
    r.onerror = (ev: any) => {
      setListening(false);
      if (ev?.error === "no-speech") setError("কোনো কথা শোনা যায়নি, আবার বলুন।");
      else if (ev?.error !== "aborted") setError("মাইক্রোফোন চালু করা যায়নি — অনুমতি দিন।");
    };
    setListening(true);
    try { r.start(); } catch { setListening(false); }
  };

  useEffect(() => {
    if (!voiceSend) return;
    setVoiceSend(false);
    void askFollow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSend]);

  const askFollow = async () => {
    const q = follow.trim();
    if (!q || !image || loading) return;
    setFollow(""); setLoading(true); setError("");
    const hist = [{ role: "assistant" as const, content: answer }, ...chat, { role: "user" as const, content: q }];
    setChat((c) => [...c, { role: "user", content: q }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, question, category: category?.label, history: hist }),
      });
      if (!res.ok || !res.body) { setError(await res.text()); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const snap = acc;
        setChat((c) => { const n = [...c]; n[n.length - 1] = { role: "assistant", content: snap }; return n; });
      }
    } catch { setError("ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPickerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  const openCategory = (c: Category) => {
    setError(""); setAnswer("");
    setCategory(c);
    setPickerOpen(true);
  };

  const openSource = (which: "cam" | "gal") => {
    setPickerOpen(false);
    (which === "cam" ? camRef : galRef).current?.click();
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    setError(""); setAnswer("");
    try { setImage(await compress(f)); } catch { setError("ছবিটি খোলা যায়নি।"); }
  };

  const analyze = async () => {
    if (!image || loading) return;
    setLoading(true); setAnswer(""); setError("");
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, question, category: category?.label }),
      });
      if (!res.ok || !res.body) { setError(await res.text()); return; }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setAnswer((a) => a + dec.decode(value, { stream: true }));
      }
    } catch { setError("ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।"); }
    finally { setLoading(false); }
  };

  const reset = () => { setImage(null); setAnswer(""); setQuestion(""); setError(""); setChat([]); setFollow(""); };

  return (
    <div className="mx-auto min-h-screen max-w-md bg-background pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-primary px-5 py-4 text-primary-foreground shadow-md">
        <Link to="/" aria-label="ফিরে যান" className="text-2xl leading-none">←</Link>
        <div className="grid h-11 w-11 place-items-center rounded-full bg-accent text-accent-foreground">
          <Sprout className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold leading-tight">Fly Agro</h1>
          <p className="text-sm opacity-90">কৃষকের বন্ধু</p>
        </div>
      </header>

      <main className="space-y-5 px-4 pt-5">
        {!image ? (
          <>
            <section className="rounded-3xl bg-card p-6 text-center shadow-sm ring-1 ring-border">
              <h2 className="text-2xl font-bold text-foreground">ছবি তুলুন, সমাধান নিন</h2>
              <p className="mt-2 text-muted-foreground">রোগাক্রান্ত পাতা, পশু, পাখি বা মাছের পরিষ্কার ছবি তুলুন — আমরা রোগ ও ঔষধ বলে দেব।</p>
              <button type="button" onClick={() => camRef.current?.click()}
                className="tap-btn mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-5 text-xl font-bold text-primary-foreground shadow-lg active:scale-[0.98]">
                <Camera className="h-7 w-7" /> ক্যামেরা দিয়ে ছবি তুলুন
              </button>
              <button type="button" onClick={() => galRef.current?.click()}
                className="tap-btn mt-3 flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-primary py-4 text-lg font-semibold text-primary active:scale-[0.98]">
                <ImagePlus className="h-6 w-6" /> গ্যালারি থেকে নিন
              </button>
            </section>

            <section>
              <h3 className="mb-1 font-semibold text-foreground">ক্যাটাগরি সিলেক্ট করুন</h3>
              <p className="mb-3 text-sm text-muted-foreground">যেটার ছবি তুলবেন সেটাতে ট্যাপ করুন — সরাসরি ক্যামেরা বা গ্যালারি খুলে যাবে।</p>
              <div className="no-select grid grid-cols-3 gap-2">
                {categories.map((c) => (
                  <button type="button" key={c.id} onClick={() => openCategory(c)} aria-label={c.label}
                    className={`tap-btn flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-sm font-medium transition active:scale-[0.96] ${
                      category?.id === c.id
                        ? "bg-primary text-primary-foreground ring-2 ring-primary"
                        : "bg-secondary text-secondary-foreground"
                    }`}>
                    <c.Icon className="h-6 w-6" />
                    {c.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              <b className="text-foreground">ভালো ফলের জন্য:</b> দিনের আলোতে, কাছ থেকে, আক্রান্ত অংশ স্পষ্ট করে ছবি তুলুন।
            </section>
          </>
        ) : (
          <>
            <div className="overflow-hidden rounded-3xl shadow-md ring-1 ring-border">
              <img src={image} alt="আপলোড করা ছবি" className="max-h-80 w-full object-cover" />
            </div>
            {category && (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-secondary px-4 py-3 text-secondary-foreground">
                <span className="flex items-center gap-2 font-semibold"><category.Icon className="h-5 w-5" /> {category.label}</span>
                <button type="button" onClick={() => setPickerOpen(true)} className="tap-btn rounded-full border border-primary px-3 py-1 text-sm font-semibold text-primary">
                  বদলুন
                </button>
              </div>
            )}
            {!answer && !loading && (
              <div className="space-y-3">
                <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2}
                  placeholder="কোনো প্রশ্ন থাকলে লিখুন (ঐচ্ছিক) — যেমন: পাতায় দাগ পড়ছে কেন?"
                  className="w-full rounded-2xl border border-input bg-card p-4 text-base text-foreground outline-none focus:ring-2 focus:ring-ring" />
                <button type="button" onClick={analyze}
                  className="tap-btn flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-5 text-xl font-bold text-primary-foreground shadow-lg active:scale-[0.98]">
                  <Send className="h-6 w-6" /> রোগ নির্ণয় করুন
                </button>
              </div>
            )}
            {loading && !answer && (
              <div className="flex items-center justify-center gap-3 rounded-2xl bg-secondary p-6 text-lg text-secondary-foreground">
                <Loader2 className="h-6 w-6 animate-spin" /> ছবি বিশ্লেষণ করা হচ্ছে...
              </div>
            )}
            {answer && (
              <article className="select-text prose-agro rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border">
                <ReactMarkdown>{answer}</ReactMarkdown>
                {loading && !chat.length && <Loader2 className="mt-2 h-5 w-5 animate-spin text-primary" />}
              </article>
            )}
            {answer && chat.map((m, i) => (
              <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl bg-primary px-4 py-3 text-primary-foreground" : "prose-agro rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border select-text"}>
                {m.role === "user" ? m.content : m.content ? <ReactMarkdown>{m.content}</ReactMarkdown> : <Loader2 className="h-5 w-5 animate-spin text-primary" />}
              </div>
            ))}
            {answer && (
              <div className="flex items-end gap-2">
                <textarea value={follow} onChange={(e) => setFollow(e.target.value)} rows={1}
                  placeholder="আরও প্রশ্ন করুন — যেমন: কতদিন পর পর স্প্রে করব?"
                  className="flex-1 resize-none rounded-2xl border border-input bg-card p-3 text-base text-foreground outline-none focus:ring-2 focus:ring-ring" />
                <button type="button" onClick={() => listen((t) => setFollow((f) => (f ? f + " " : "") + t))} aria-label="ভয়েসে প্রশ্ন"
                  className={`tap-btn grid h-12 w-12 shrink-0 place-items-center rounded-full ${listening ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-secondary text-secondary-foreground"}`}>
                  <Mic className="h-5 w-5" />
                </button>
                <button type="button" onClick={askFollow} disabled={loading || !follow.trim()} aria-label="পাঠান"
                  className="tap-btn grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-50">
                  <Send className="h-5 w-5" />
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={loading} onClick={() => { reset(); camRef.current?.click(); }}
                className="tap-btn flex items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground disabled:opacity-50">
                <Camera className="h-5 w-5" /> ক্যামেরা
              </button>
              <button type="button" disabled={loading} onClick={() => { reset(); galRef.current?.click(); }}
                className="tap-btn flex items-center justify-center gap-2 rounded-2xl border-2 border-primary py-4 text-base font-bold text-primary disabled:opacity-50">
                <ImagePlus className="h-5 w-5" /> গ্যালারি থেকে
              </button>
            </div>
            <button type="button" onClick={reset} disabled={loading}
              className="tap-btn flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-primary py-4 text-lg font-semibold text-primary disabled:opacity-50">
              <RotateCcw className="h-5 w-5" /> নতুন ছবি দিন
            </button>
          </>
        )}
        {error && <p className="rounded-2xl bg-destructive/10 p-4 text-center text-destructive">{error}</p>}
      </main>

      {pickerOpen && category && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 p-4" role="dialog" aria-modal="true"
          aria-label={`${category.label} — ক্যামেরা বা গ্যালারি সিলেক্ট করুন`} onClick={() => setPickerOpen(false)}>
          <div className="no-select w-full max-w-md rounded-3xl bg-card p-5 shadow-xl ring-1 ring-border" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">সিলেক্ট করা হয়েছে</p>
                <p className="flex items-center gap-2 text-xl font-bold text-foreground"><category.Icon className="h-6 w-6 text-primary" /> {category.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{category.hint}</p>
              </div>
              <button type="button" onClick={() => setPickerOpen(false)} aria-label="বন্ধ করুন"
                className="tap-btn grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <button type="button" onClick={() => openSource("cam")}
              className="tap-btn flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-5 text-xl font-bold text-primary-foreground shadow-lg active:scale-[0.98]">
              <Camera className="h-7 w-7" /> ক্যামেরা দিয়ে ছবি তুলুন
            </button>
            <button type="button" onClick={() => openSource("gal")}
              className="tap-btn mt-3 flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-primary py-4 text-lg font-semibold text-primary active:scale-[0.98]">
              <ImagePlus className="h-6 w-6" /> গ্যালারি থেকে নিন
            </button>
          </div>
        </div>
      )}

      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
