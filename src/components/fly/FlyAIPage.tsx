import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { ArrowLeft, Bot, ImagePlus, Loader2, Mail, MessageCircle, Send, Square } from "lucide-react";
import { db } from "../../lib/firebase";
import { fetchProfile } from "./chat";
import type { UserProfile } from "./types";

type Item =
  | { role: "user" | "assistant"; content: string; image?: string }
  | { role: "error"; content: string };

const ADMIN_EMAIL = "52sagorislam46@gmail.com";
const ADMIN_USERNAMES = ["52sagorislam46", "52sagorislam46-spec"];

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
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items]);

  useEffect(() => () => abortRef.current?.abort(), []);

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
    const q = text.trim();
    if (!q || busy) return;
    setText("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const history = [...items, { role: "user" as const, content: q }];
    setItems(history);
    try {
      if (imageMode) {
        const res = await fetch("/api/fly-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "image", prompt: q }),
          signal: ctrl.signal,
        });
        const data = (await res.json().catch(() => ({}))) as { image?: string; text?: string; error?: string };
        const img = data.image;
        if (!res.ok || !img) throw new Error(data.error ?? "Could not create the image.");
        setItems((p) => [...p, { role: "assistant", content: data.text ?? "", image: img }]);
        return;
      }
      const res = await fetch("/api/fly-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history
            .filter((m): m is Extract<Item, { role: "user" | "assistant" }> => m.role !== "error")
            .slice(1)
            .map((m) => ({ role: m.role, content: m.content })),
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
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-white">
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
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
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
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}
        {busy && imageMode && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 size={14} className="animate-spin" /> Creating your image…
          </div>
        )}
      </div>

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
            disabled={!text.trim()}
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
