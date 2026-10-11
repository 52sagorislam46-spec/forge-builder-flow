import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { ArrowLeft, Bot, Camera, Copy, ImagePlus, Images, Loader2, Mail, MessageCircle, Mic, Pencil, Send, Square, Trash2, X } from "lucide-react";
import { db } from "../../lib/firebase";
import { fetchProfile } from "./chat";
import type { UserProfile } from "./types";

type Item =
  | { role: "user" | "assistant"; content: string; image?: string }
  | { role: "error"; content: string };

const ADMIN_EMAIL = "52sagorislam46@gmail.com";
const ADMIN_USERNAMES = ["52sagorislam46", "52sagorislam46-spec"];

async function compressImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
  const s = Math.min(1, 1280 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", 0.85);
}

async function findAdmin(): Promise<UserProfile | null> {
  for (const u of ADMIN_USERNAMES) {
    const snap = await getDocs(query(collection(db, "users"), where("username", "==", u), limit(1)));
    const d = snap.docs[0];
    if (d) return fetchProfile(d.id);
  }
  const snap = await getDocs(query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1)));
  const d = snap.docs[0];
  return d ? fetchProfile(d.id) : null;
}

export function FlyAIPage({
  onBack,
  onOpenChat,
}: {
  onBack: () => void;
  onOpenChat: (p: UserProfile) => void;
}) {
  const [items, setItems] = useState<Item[]>([
    {
      role: "assistant",
      content:
        "আসসালামু আলাইকুম! আমি **Fly AI** 🤖 — যেকোনো প্রশ্ন করুন। ছবি বানাতে 🖼️ বাটনে চাপ দিয়ে ছবির বর্ণনা লিখুন।\n\nHi! Ask me anything, or tap 🖼️ to create an image.",
    },
  ]);
  const [text, setText] = useState("");
  const [imageMode, setImageMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [attach, setAttach] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSend, setVoiceSend] = useState(false);
  const [menu, setMenu] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const galRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const flash = (t: string) => { setToast(t); setTimeout(() => setToast(""), 1600); };

  const onPick = async (f?: File) => {
    if (!f) return;
    try { setAttach(await compressImage(f)); setImageMode(false); } catch { flash("ছবিটি খোলা যায়নি"); }
  };

  const toggleVoice = () => {
    if (listening) { recRef.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any };
    const SR = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!SR) { flash("এই ডিভাইসে ভয়েস সাপোর্ট নেই"); return; }
    const r = new SR();
    r.lang = /[\u0980-\u09FF]/.test(text) || navigator.language.startsWith("bn") ? "bn-BD" : "bn-BD";
    r.interimResults = true;
    r.continuous = false;
    const base = text ? text + " " : "";
    let heard = false;
    r.onresult = (e: any) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      if (t.trim()) heard = true;
      setText(base + t);
    };
    r.onend = () => { setListening(false); if (heard) setVoiceSend(true); };
    r.onerror = (ev: any) => {
      setListening(false);
      if (ev?.error === "no-speech") flash("কোনো কথা শোনা যায়নি, আবার বলুন");
      else if (ev?.error !== "aborted") flash("মাইক্রোফোন চালু করা যায়নি — অনুমতি দিন");
    };
    recRef.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); flash("মাইক্রোফোন চালু করা যায়নি"); }
  };

  const copyMsg = async (i: number) => {
    const m = items[i];
    try { await navigator.clipboard.writeText(m?.content ?? ""); flash("কপি হয়েছে"); } catch { flash("কপি করা যায়নি"); }
    setMenu(null);
  };
  const deleteMsg = (i: number) => {
    setItems((p) => p.filter((_, j) => j !== i));
    setMenu(null);
  };
  const editMsg = (i: number) => {
    const m = items[i];
    if (!m || m.role !== "user") return;
    setText(m.content);
    if (m.image) setAttach(m.image);
    setItems((p) => p.slice(0, i));
    setMenu(null);
  };
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!voiceSend) return;
    setVoiceSend(false);
    if (text.trim() && !busy) void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSend]);

  const contactAdmin = async () => {
    setAdminBusy(true);
    try {
      const admin = await findAdmin();
      if (admin) onOpenChat(admin);
      else window.location.href = `mailto:${ADMIN_EMAIL}`;
    } catch {
      window.location.href = `mailto:${ADMIN_EMAIL}`;
    } finally {
      setAdminBusy(false);
    }
  };

  const send = async () => {
    const img = attach;
    const q = text.trim() || (img ? "এই ছবিটি বিশ্লেষণ করে বিস্তারিত বলো।" : "");
    if (!q || busy) return;
    setText("");
    setAttach(null);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const history: Item[] = [...items, img ? { role: "user" as const, content: q, image: img } : { role: "user" as const, content: q }];
    setItems(history);
    try {
      const wantsEdit =
        !!img &&
        /(edit|change|remove|add|make|convert|background|ইডিট|এডিট|সম্পাদনা|বদল|পরিবর্তন|মুছ|সরিয়|সরাও|যোগ কর|বানিয়ে দাও|ব্যাকগ্রাউন্ড|রং)/i.test(text);
      if (imageMode || wantsEdit) {
        const res = await fetch("/api/fly-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "image", prompt: q, image: img ?? undefined }),
          signal: ctrl.signal,
        });
        const data = (await res.json().catch(() => ({}))) as { image?: string; text?: string; error?: string };
        const outImg = data.image;
        if (!res.ok || !outImg) throw new Error(data.error ?? "Could not create the image.");
        setItems((p) => [...p, { role: "assistant", content: data.text ?? "", image: outImg }]);
        return;
      }
      const res = await fetch("/api/fly-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history
            .filter((m): m is Extract<Item, { role: "user" | "assistant" }> => m.role !== "error")
            .slice(1)
            .map((m) => (m.image && m.role === "user" ? { role: m.role, content: m.content, image: m.image } : { role: m.role, content: m.content })),
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || "Fly AI could not answer.");
      setItems((p) => [...p, { role: "assistant", content: "" }]);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const snapshot = acc;
        setItems((p) => {
          const next = [...p];
          next[next.length - 1] = { role: "assistant", content: snapshot };
          return next;
        });
      }
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setItems((p) => [...p, { role: "error", content: e instanceof Error ? e.message : "Something went wrong." }]);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 mx-auto w-full max-w-md flex flex-col h-[100dvh] overflow-hidden bg-white">
      <header className="flex items-center gap-3 px-4 h-14 border-b border-gray-100 bg-white">
        <button onClick={onBack} aria-label="Back" className="text-gray-500">
          <ArrowLeft size={22} />
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 text-white flex items-center justify-center">
          <Bot size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 leading-tight">Fly AI</p>
          <p className="text-xs text-gray-500">Ask anything · Create images</p>
        </div>
        <button
          onClick={() => void contactAdmin()}
          disabled={adminBusy}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-sky-50 text-sky-700 text-xs font-semibold disabled:opacity-60"
        >
          {adminBusy ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
          Contact admin
        </button>
      </header>

      <div className="px-4 py-2 bg-sky-50 border-b border-sky-100 text-xs text-sky-800 flex items-center gap-2">
        <Mail size={14} />
        <span className="truncate">
          Admin: <b>Sagor Islam</b> ·{" "}
          <a className="underline" href={`mailto:${ADMIN_EMAIL}`}>
            {ADMIN_EMAIL}
          </a>
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-3">
        {items.map((m, i) => (
          <div key={i} className={`relative flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              // Long-press must stay free for the phone's own drag-to-select + Copy.
              style={{ WebkitUserSelect: "text", userSelect: "text", WebkitTouchCallout: "default" } as Record<string, string>}
              className={`select-text max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                m.role === "user"
                  ? "bg-sky-500 text-white rounded-br-md whitespace-pre-wrap"
                  : m.role === "error"
                    ? "bg-red-50 text-red-700"
                    : "bg-gray-100 text-gray-900 rounded-bl-md"
              }`}
            >
              {m.role === "assistant" ? (
                <>
                  {m.image && (
                    <a href={m.image} download="fly-ai.png" target="_blank" rel="noreferrer">
                      <img src={m.image} alt="AI generated" className="rounded-xl mb-2 w-full" />
                    </a>
                  )}
                  {m.content ? (
                    <div className="prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : !m.image ? (
                    <Loader2 size={16} className="animate-spin text-gray-400" />
                  ) : null}
                </>
              ) : m.role === "user" ? (
                <>
                  {m.image && <img src={m.image} alt="Uploaded" className="rounded-xl mb-2 w-full max-h-64 object-cover" />}
                  {m.content}
                </>
              ) : (
                m.content
              )}
            </div>
            {i > 0 && m.role !== "error" && (
              <div className={`mt-1 flex gap-1 text-gray-400 ${menu === i ? "" : "opacity-70"}`}>
                <button type="button" onClick={() => void copyMsg(i)} aria-label="Copy" className="p-1 hover:text-gray-700"><Copy size={14} /></button>
                {m.role === "user" && !busy && (
                  <button type="button" onClick={() => editMsg(i)} aria-label="Edit" className="p-1 hover:text-gray-700"><Pencil size={14} /></button>
                )}
                <button type="button" onClick={() => deleteMsg(i)} aria-label="Delete / Unsend" className="p-1 hover:text-red-600"><Trash2 size={14} /></button>
              </div>
            )}
          </div>
        ))}
        {busy && imageMode && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 size={14} className="animate-spin" /> Creating your image…
          </div>
        )}
      </div>

      {toast && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-24 px-3 py-1.5 rounded-full bg-gray-900 text-white text-xs z-20">{toast}</div>
      )}
      {attach && (
        <div className="px-3 pt-2 border-t border-gray-100 bg-white flex items-center gap-2">
          <div className="relative">
            <img src={attach} alt="Attachment" className="w-16 h-16 rounded-xl object-cover" />
            <button type="button" onClick={() => setAttach(null)} aria-label="Remove photo" className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center"><X size={12} /></button>
          </div>
          <span className="text-xs text-gray-500">ছবি সম্পর্কে প্রশ্ন লিখুন বা সরাসরি পাঠান</span>
        </div>
      )}
      <input ref={galRef} type="file" accept="image/*" hidden onChange={(e) => { void onPick(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void onPick(e.target.files?.[0]); e.target.value = ""; }} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex items-end gap-2 px-3 py-2 border-t border-gray-100 bg-white pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <button
          type="button"
          onClick={() => setImageMode((v) => !v)}
          aria-label="Create image"
          className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${
            imageMode ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          <ImagePlus size={19} />
        </button>
        <button type="button" onClick={() => galRef.current?.click()} aria-label="Upload from gallery"
          className="w-10 h-10 shrink-0 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center">
          <Images size={19} />
        </button>
        <button type="button" onClick={() => camRef.current?.click()} aria-label="Take photo"
          className="w-10 h-10 shrink-0 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center max-[380px]:hidden">
          <Camera size={19} />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder={imageMode ? "Describe the picture…" : "Ask Fly AI anything…"}
          className="flex-1 resize-none max-h-32 rounded-2xl bg-gray-100 px-4 py-2.5 text-sm outline-none"
        />
        <button type="button" onClick={toggleVoice} aria-label="Voice"
          className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${listening ? "bg-red-500 text-white animate-pulse" : "bg-gray-100 text-gray-600"}`}>
          <Mic size={18} />
        </button>
        {busy ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            aria-label="Stop"
            className="w-10 h-10 shrink-0 rounded-full bg-gray-800 text-white flex items-center justify-center"
          >
            <Square size={16} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!text.trim() && !attach}
            aria-label="Send"
            className="w-10 h-10 shrink-0 rounded-full bg-sky-500 text-white flex items-center justify-center disabled:opacity-50"
          >
            <Send size={18} />
          </button>
        )}
      </form>
    </div>
  );
}
