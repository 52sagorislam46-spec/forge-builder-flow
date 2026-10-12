import { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Flag,
  Heart,
  Camera,
  CopyCheck,
  ImagePlus,
  Music,
  Link2,
  Loader2,
  MoreVertical,
  Plus,
  Send,
  SmilePlus,
  Trash2,
  X,
} from "lucide-react";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db, isVideoFile, secureUrl, uploadToCloudinary } from "../../lib/firebase";
import { useAuth } from "./AuthContext";
import { fetchProfile, sendMessage } from "./chat";
import { notifyUpload } from "../../lib/appNotifications";
import { Avatar } from "./Avatar";
import type { Story } from "./types";
import {
  NOTE_MAX,
  deleteNote,
  saveNote,
  subscribeNotes,
  type UserNote,
} from "./notes";



const STORY_TTL = 24 * 60 * 60 * 1000; // 24 hours
const STORY_DURATION = 5000; // 5s per image story

function toMillis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in (value as object)) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return typeof value === "number" ? value : Date.now();
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h`;
}

function useStories() {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "stories"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        setStories(
          snap.docs
            .map((d) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const data: any = d.data();
              return {
                id: d.id,
                authorId: data.authorId ?? "",
                authorName: data.authorName ?? "Anonymous",
                authorUsername: data.authorUsername ?? "user",
                authorPhoto: data.authorPhoto ?? "",
                mediaUrl: data.mediaUrl ?? "",
                mediaType: data.mediaType ?? "image",
                musicUrl: data.musicUrl ?? "",
                musicName: data.musicName ?? "",
                createdAt: toMillis(data.createdAt),
                reactions: (data.reactions as Record<string, string>) ?? {},
              } as Story;
            })
            .filter((s) => s.mediaUrl && now - s.createdAt < STORY_TTL),
        );
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  return { stories, loading };
}

interface StoryGroup {
  authorId: string;
  authorName: string;
  authorPhoto: string;
  stories: Story[];
}

const TEXT_BGS = [
  "linear-gradient(135deg,#f97316,#ec4899)",
  "linear-gradient(135deg,#0ea5e9,#6366f1)",
  "linear-gradient(135deg,#a855f7,#ec4899)",
  "linear-gradient(135deg,#059669,#84cc16)",
  "linear-gradient(135deg,#111827,#4b5563)",
  "linear-gradient(135deg,#f43f5e,#fbbf24)",
];
const TEXT_BG_STOPS: [string, string][] = [
  ["#f97316", "#ec4899"],
  ["#0ea5e9", "#6366f1"],
  ["#a855f7", "#ec4899"],
  ["#059669", "#84cc16"],
  ["#111827", "#4b5563"],
  ["#f43f5e", "#fbbf24"],
];

function wrapLines(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > max && line) {
        out.push(line);
        line = w;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

export const STORY_FILTERS = [
  { n: "Normal", f: "none" },
  { n: "Warm", f: "sepia(0.35) saturate(1.4)" },
  { n: "B&W", f: "grayscale(1)" },
  { n: "Vivid", f: "saturate(1.8) contrast(1.1)" },
  { n: "Cool", f: "hue-rotate(20deg) saturate(1.2)" },
  { n: "Fade", f: "contrast(0.85) brightness(1.1)" },
];
const STICKERS = ["😍", "😂", "🔥", "❤️", "👍", "🎉", "🌸", "⭐", "😎", "🥳", "💯", "🙏", "🌙", "☀️", "🌾", "🎂"];
type StickerItem = { e: string; x: number; y: number };

/** Renders a text story (or a photo with a caption) into a 1080x1920 JPEG. */
async function renderStoryImage(
  text: string,
  bgIdx: number,
  photo?: File,
  extra?: { filter?: string; stickers?: StickerItem[] },
): Promise<File> {
  const W = 1080, H = 1920;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  if (photo) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const img = new Image();
    img.src = URL.createObjectURL(photo);
    await img.decode();
    const s = Math.min(W / img.width, H / img.height);
    const w = img.width * s, h = img.height * s;
    if (extra?.filter && extra.filter !== "none") ctx.filter = extra.filter;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    ctx.filter = "none";
  } else {
    const [a, b] = TEXT_BG_STOPS[bgIdx]!;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (text.trim()) {
    const size = photo ? 64 : text.length > 120 ? 70 : 96;
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lines = wrapLines(ctx, text.trim(), W - 160);
    const lh = size * 1.3;
    const startY = (photo ? H * 0.78 : H / 2) - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => {
      const y = startY + i * lh;
      if (photo) {
        const tw = ctx.measureText(l).width;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(W / 2 - tw / 2 - 24, y - lh / 2, tw + 48, lh);
      }
      ctx.fillStyle = "#fff";
      ctx.fillText(l, W / 2, y);
    });
  }
  for (const st of extra?.stickers ?? []) {
    ctx.font = "160px system-ui, 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(st.e, st.x * W, st.y * H);
  }
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.9));
  return new File([blob], "story.jpg", { type: "image/jpeg" });
}

const SONG_TAGS = ["Bangla", "Romantic", "Birthday", "Sad", "Party", "Islamic", "Hindi", "Lofi"];

/** Online song search (free iTunes preview clips, 30s). */
function SongPicker({ onClose, onPick }: { onClose: () => void; onPick: (s: { url: string; name: string }) => void }) {
  const [q, setQ] = useState("Bangla");
  const [list, setList] = useState<{ id: number; name: string; artist: string; art: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=30&term=${encodeURIComponent(term)}`);
        const j = (await r.json()) as { results: { trackId: number; trackName: string; artistName: string; artworkUrl60: string; previewUrl?: string }[] };
        setList(j.results.filter((x) => x.previewUrl).map((x) => ({ id: x.trackId, name: x.trackName, artist: x.artistName, art: x.artworkUrl60, url: x.previewUrl! })));
      } catch {
        setList([]);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);
  const play = (url: string) => {
    const a = audioRef.current;
    if (!a) return;
    if (playing === url) { a.pause(); setPlaying(""); return; }
    a.src = url; void a.play(); setPlaying(url);
  };
  return (
    <div className="fixed inset-0 z-[70] bg-white flex flex-col">
      <audio ref={audioRef} onEnded={() => setPlaying("")} />
      <div className="flex items-center gap-2 px-3 h-14 border-b border-gray-100">
        <button onClick={onClose} aria-label="Close" className="text-gray-700"><X size={24} /></button>
        <h2 className="font-bold text-gray-900">Add a song to your story</h2>
      </div>
      <div className="p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search music" className="w-full h-10 px-4 rounded-full bg-gray-100 text-gray-900 outline-none" />
        <div className="flex gap-2 overflow-x-auto mt-3">
          {SONG_TAGS.map((t) => (
            <button key={t} onClick={() => setQ(t)} className={`shrink-0 px-3 h-8 rounded-full text-xs font-semibold ${q === t ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-800"}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-500" /></div>}
        {!loading && list.length === 0 && <p className="text-center text-sm text-gray-500 py-6">No songs found</p>}
        {list.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-3 py-2">
            <button onClick={() => play(s.url)} className="relative shrink-0" aria-label="Preview">
              <img src={s.art} alt="" className="w-12 h-12 rounded-lg" />
              <span className="absolute inset-0 flex items-center justify-center text-white text-lg bg-black/30 rounded-lg">{playing === s.url ? "❚❚" : "▶"}</span>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{s.name}</p>
              <p className="text-xs text-gray-500 truncate">{s.artist}</p>
            </div>
            <button onClick={() => { audioRef.current?.pause(); onPick({ url: s.url, name: `${s.name} · ${s.artist}` }); }} className="px-3 h-8 rounded-full bg-sky-500 text-white text-xs font-semibold">Use</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddStoryModal({ onClose }: { onClose: () => void }) {
  const { ensureUserProfile } = useAuth();
  const [mode, setMode] = useState<"pick" | "text" | "media">("pick");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState("");
  const [bg, setBg] = useState(0);
  const [music, setMusic] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [gallery, setGallery] = useState<{ file: File; url: string }[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [multi, setMulti] = useState(false);
  const [durations, setDurations] = useState<Record<number, number>>({});
  const [song, setSong] = useState<{ url: string; name: string } | null>(null);
  const [showSongs, setShowSongs] = useState(false);
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [filterIdx, setFilterIdx] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);

  const loadGallery = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!list.length) return;
    const items = list.map((file) => ({ file, url: URL.createObjectURL(file) }));
    if (!multi && items.length === 1) {
      useFiles(items.map((i) => i.file));
      return;
    }
    setGallery((g) => [...items, ...g]);
    setMulti(true);
  };

  const useFiles = (list: File[]) => {
    setFiles(list);
    setPreviews(list.map((f) => URL.createObjectURL(f)));
    setIdx(0);
    setMode("media");
  };

  const toggleSel = (i: number) => {
    if (!multi) {
      useFiles([gallery[i]!.file]);
      return;
    }
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  };

  const submit = async () => {
    setBusy("Uploading…");
    setError("");
    try {
      const profile = await ensureUserProfile();
      let musicUrl = "";
      if (music) {
        setBusy("Uploading music…");
        musicUrl = (await uploadToCloudinary(music)).url;
      } else if (song) {
        musicUrl = song.url;
      }
      const extra = { filter: STORY_FILTERS[filterIdx]!.f, stickers };
      const decorated = !!text.trim() || stickers.length > 0 || filterIdx !== 0;
      const toUpload: File[] =
        mode === "text"
          ? [await renderStoryImage(text, bg, undefined, extra)]
          : await Promise.all(
              files.map((f, i) =>
                i === 0 && decorated && !isVideoFile(f)
                  ? renderStoryImage(text, bg, f, extra)
                  : Promise.resolve(f),
              ),
            );
      for (let i = 0; i < toUpload.length; i++) {
        const f = toUpload[i]!;
        setBusy(`Uploading ${i + 1}/${toUpload.length}…`);
        const uploaded = await uploadToCloudinary(f);
        const storyMediaType =
          uploaded.resourceType || (isVideoFile(f) ? "video" : "image");
        await addDoc(collection(db, "stories"), {
          authorId: profile.uid,
          authorName: profile.displayName,
          authorUsername: profile.username,
          authorPhoto: profile.photoURL,
          mediaUrl: uploaded.url,
          mediaType: storyMediaType,
          musicUrl,
          musicName: music?.name ?? song?.name ?? "",
          createdAt: serverTimestamp(),
        });
        if (i === 0)
          void notifyUpload({
            type: "story",
            actorId: profile.uid,
            actorName: profile.displayName,
            actorPhoto: profile.photoURL,
            followers: profile.followers,
            mediaUrl: storyMediaType === "image" ? uploaded.url : "",
          });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add story");
    } finally {
      setBusy("");
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  const musicInput = (
    <label className="flex items-center gap-2 px-3 h-9 rounded-full bg-white/20 text-white text-xs font-semibold cursor-pointer">
      <Music size={16} />
      <span className="max-w-[140px] truncate">{music ? music.name : "File"}</span>
      <input
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          setMusic(e.target.files?.[0] ?? null);
          setSong(null);
        }}
      />
    </label>
  );
  const songButton = (
    <button
      onClick={() => setShowSongs(true)}
      className="flex items-center gap-2 px-3 h-9 rounded-full bg-white/20 text-white text-xs font-semibold"
    >
      <Music size={16} />
      <span className="max-w-[120px] truncate">{song ? song.name : "Songs"}</span>
    </button>
  );

  if (mode === "text" || mode === "media") {
    const cur = files[idx];
    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col">
        <div className="flex items-center justify-between p-3">
          <button
            onClick={() => (mode === "text" ? setMode("pick") : setMode("pick"))}
            className="text-white"
            aria-label="Back"
          >
            <X size={26} />
          </button>
          <div className="flex gap-2">
            {songButton}
            {musicInput}
            {(music || song) && (
              <button onClick={() => { setMusic(null); setSong(null); }} className="text-white/70 text-xs">
                Remove
              </button>
            )}
          </div>
        </div>
        <div
          ref={stageRef}
          className="flex-1 mx-3 rounded-2xl overflow-hidden relative flex items-center justify-center"
          style={{ background: mode === "text" ? TEXT_BGS[bg] : "#000" }}
        >
          {mode === "media" && cur &&
            (isVideoFile(cur) ? (
              <video src={previews[idx]} controls className="max-h-full max-w-full" />
            ) : (
              <img
                src={previews[idx]}
                alt="preview"
                className="max-h-full max-w-full object-contain"
                style={{ filter: idx === 0 ? STORY_FILTERS[filterIdx]!.f : "none" }}
              />
            ))}
          {(mode === "text" || (cur && !isVideoFile(cur) && idx === 0)) &&
            stickers.map((st, si) => (
              <span
                key={si}
                className="absolute z-10 text-6xl select-none touch-none cursor-move -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${st.x * 100}%`, top: `${st.y * 100}%` }}
                onPointerDown={(e) => {
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!(e.buttons & 1) && e.pointerType === "mouse") return;
                  if (!(e.target as HTMLElement).hasPointerCapture(e.pointerId)) return;
                  const r = stageRef.current?.getBoundingClientRect();
                  if (!r) return;
                  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
                  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
                  setStickers((s) => s.map((o, j) => (j === si ? { ...o, x, y } : o)));
                }}
                onDoubleClick={() => setStickers((s) => s.filter((_, j) => j !== si))}
              >
                {st.e}
              </span>
            ))}
          {(mode === "text" || (cur && !isVideoFile(cur) && idx === 0)) && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mode === "text" ? "Start typing" : "Add text…"}
              className={`absolute inset-x-4 bg-transparent text-white text-center font-bold outline-none resize-none placeholder:text-white/60 ${
                mode === "text" ? "top-1/3 text-3xl h-1/3" : "bottom-6 text-xl h-24 [text-shadow:0_1px_4px_rgba(0,0,0,.8)]"
              }`}
            />
          )}
          {files.length > 1 && (
            <div className="absolute top-2 inset-x-0 flex justify-center gap-1">
              {files.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={`w-2 h-2 rounded-full ${i === idx ? "bg-white" : "bg-white/40"}`}
                />
              ))}
            </div>
          )}
        </div>
        {mode === "text" && (
          <div className="flex gap-2 justify-center py-3">
            {TEXT_BGS.map((b, i) => (
              <button
                key={i}
                onClick={() => setBg(i)}
                className={`w-8 h-8 rounded-full ${bg === i ? "ring-2 ring-white" : ""}`}
                style={{ background: b }}
              />
            ))}
          </div>
        )}
        {mode === "media" && cur && !isVideoFile(cur) && idx === 0 && (
          <div className="flex gap-2 overflow-x-auto px-3 pt-3">
            {STORY_FILTERS.map((f, i) => (
              <button
                key={f.n}
                onClick={() => setFilterIdx(i)}
                className={`shrink-0 px-3 h-8 rounded-full text-xs font-semibold ${filterIdx === i ? "bg-white text-black" : "bg-white/20 text-white"}`}
              >
                {f.n}
              </button>
            ))}
          </div>
        )}
        {(mode === "text" || (cur && !isVideoFile(cur) && idx === 0)) && (
          <div className="flex gap-1 overflow-x-auto px-3 pt-2">
            {STICKERS.map((e) => (
              <button
                key={e}
                onClick={() => setStickers((s) => [...s, { e, x: 0.5, y: 0.4 }])}
                className="shrink-0 w-10 h-10 text-2xl"
                aria-label={`Add sticker ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        {showSongs && (
          <SongPicker
            onClose={() => setShowSongs(false)}
            onPick={(s) => {
              setSong(s);
              setMusic(null);
              setShowSongs(false);
            }}
          />
        )}
        {error && <p className="text-sm text-red-300 text-center px-4">{error}</p>}
        <div className="p-3 flex justify-end">
          <button
            onClick={submit}
            disabled={!!busy || (mode === "text" && !text.trim())}
            className="h-11 px-6 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy || (files.length > 1 ? `Share ${files.length} stories` : "Share to story")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col">
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-100">
        <button onClick={onClose} className="text-gray-700" aria-label="Close">
          <X size={24} />
        </button>
        <h2 className="text-base font-bold text-gray-900">Create story</h2>
        <span className="w-6" />
      </div>
      <div className="grid grid-cols-3 gap-2 p-3">
        <button
          onClick={() => setMode("text")}
          className="h-32 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-white flex flex-col items-center justify-center gap-2"
        >
          <span className="w-10 h-10 rounded-full bg-white/25 flex items-center justify-center font-bold">Aa</span>
          <span className="text-sm font-semibold">Text</span>
        </button>
        <label className="h-32 rounded-2xl bg-gradient-to-br from-pink-500 to-orange-400 text-white flex flex-col items-center justify-center gap-2 cursor-pointer">
          <span className="w-10 h-10 rounded-full bg-white/25 flex items-center justify-center"><Music size={20} /></span>
          <span className="text-sm font-semibold">Music</span>
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setMusic(f);
                setMode("text");
              }
            }}
          />
        </label>
        <label className="h-32 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex flex-col items-center justify-center gap-2 cursor-pointer">
          <span className="w-10 h-10 rounded-full bg-white/25 flex items-center justify-center"><Camera size={20} /></span>
          <span className="text-sm font-semibold">Camera</span>
          <input
            type="file"
            accept="image/*,video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) useFiles([f]);
            }}
          />
        </label>
      </div>
      <div className="flex items-center justify-between px-4 py-2">
        <span className="font-semibold text-gray-900">Gallery</span>
        <button
          onClick={() => {
            setMulti((m) => !m);
            setSelected([]);
          }}
          className={`flex items-center gap-1 text-sm font-semibold px-3 h-8 rounded-full ${multi ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-700"}`}
        >
          <CopyCheck size={16} /> Select multiple
        </button>
      </div>
      <div className="flex-1 overflow-y-auto grid grid-cols-3 gap-0.5 content-start">
        <label className="aspect-[3/4] bg-gray-100 flex flex-col items-center justify-center gap-1 text-gray-500 cursor-pointer">
          <ImagePlus size={28} />
          <span className="text-xs">Open gallery</span>
          <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={loadGallery} />
        </label>
        {gallery.map((g, i) => {
          const pos = selected.indexOf(i);
          return (
            <button key={g.url} onClick={() => toggleSel(i)} className="relative aspect-[3/4] bg-black overflow-hidden">
              {isVideoFile(g.file) ? (
                <video
                  src={g.url}
                  muted
                  preload="metadata"
                  className="w-full h-full object-cover"
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    setDurations((p) => ({ ...p, [i]: d }));
                  }}
                />
              ) : (
                <img src={g.url} alt="" className="w-full h-full object-cover" />
              )}
              {isVideoFile(g.file) && durations[i] != null && (
                <span className="absolute bottom-1 right-1 text-[10px] font-semibold text-white bg-black/50 rounded px-1">
                  {fmt(durations[i]!)}
                </span>
              )}
              {multi && (
                <span className={`absolute top-1 right-1 w-6 h-6 rounded-full border-2 border-white text-xs font-bold flex items-center justify-center ${pos >= 0 ? "bg-sky-500 text-white" : "bg-black/30"}`}>
                  {pos >= 0 ? pos + 1 : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {multi && selected.length > 0 && (
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={() => useFiles(selected.map((i) => gallery[i]!.file))}
            className="w-full h-11 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-semibold"
          >
            Next ({selected.length})
          </button>
        </div>
      )}
    </div>
  );
}

const VIEWED_KEY = "fly_viewed_story_ids";

function readViewedIds(): string[] {
  try {
    const raw = localStorage.getItem(VIEWED_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const REACTION_EMOJIS = ["Love", "Laugh", "Surprised", "Sad", "Like", "Fire"];

// Stored reaction values stay the same words (backward compatible), but the UI
// always renders the matching emoji glyph instead of the plain text.
const REACTION_GLYPHS: Record<string, string> = {
  Love: "❤️",
  Laugh: "😂",
  Surprised: "😮",
  Sad: "😢",
  Like: "👍",
  Fire: "🔥",
};

const reactionGlyph = (value?: string) =>
  (value && REACTION_GLYPHS[value]) || value || "";

// Tapping the same emoji again removes the reaction (undo); tapping a
// different one switches it, since each user only ever has one reaction.
async function reactToStory(
  storyId: string,
  uid: string,
  emoji: string,
  current?: string,
) {
  const remove = current === emoji;
  await setDoc(
    doc(db, "stories", storyId),
    { reactions: { [uid]: remove ? deleteField() : emoji } },
    { merge: true },
  );
}

function StoryViewer({
  groups,
  startGroup,
  onClose,
  onStoryViewed,
}: {
  groups: StoryGroup[];
  startGroup: number;
  onClose: () => void;
  onStoryViewed: (storyId: string) => void;
}) {
  const { user } = useAuth();
  const [gi, setGi] = useState(startGroup);
  const [si, setSi] = useState(0);
  const [progress, setProgress] = useState(0);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuNote, setMenuNote] = useState("");

  const [replySent, setReplySent] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const group = groups[gi];
  const story = group?.stories[si];

  const myReaction = user ? story?.reactions?.[user.uid] : undefined;

  const reactionCounts = useMemo<[string, number][]>(() => {
    const counts = new Map<string, number>();
    Object.values(story?.reactions ?? {}).forEach((emoji) => {
      if (!emoji) return;
      counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [story?.reactions]);

  const totalReactions = reactionCounts.reduce((sum, [, c]) => sum + c, 0);

  // "Who reacted" list (Facebook-style)
  const [reactorsOpen, setReactorsOpen] = useState(false);
  const [reactors, setReactors] = useState<
    { uid: string; name: string; photo: string; emoji: string }[]
  >([]);
  const [reactorsLoading, setReactorsLoading] = useState(false);

  const reactorsOpenRef = useRef(false);
  reactorsOpenRef.current = reactorsOpen;

  useEffect(() => {
    if (!reactorsOpen || !story) return;
    const entries = Object.entries(story.reactions ?? {}).filter(([, e]) => !!e);
    let cancelled = false;
    setReactorsLoading(true);
    void Promise.all(
      entries.map(async ([uid, emoji]) => {
        const profile = await fetchProfile(uid).catch(() => null);
        return {
          uid,
          emoji: emoji as string,
          name: profile?.displayName ?? "Anonymous",
          photo: profile?.photoURL ?? "",
        };
      }),
    ).then((list) => {
      if (cancelled) return;
      setReactors(list);
      setReactorsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reactorsOpen, story?.id, story?.reactions]);


  const sendReply = async () => {
    if (!user || !story || !reply.trim()) return;
    setSending(true);
    try {
      // Story comments land in the author's inbox together with the story
      // media itself, so they see what the comment is about.
      const media = secureUrl(story.mediaUrl)
        ? {
            url: secureUrl(story.mediaUrl),
            type: story.mediaType === "video" ? "video" : "image",
            name: "Story",
          }
        : undefined;
      await sendMessage(user.uid, story.authorId, reply.trim(), media);
      setReply("");
      setReplySent(true);
      setTimeout(() => setReplySent(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  const next = () => {
    if (!group) return;
    if (si < group.stories.length - 1) {
      setSi(si + 1);
    } else if (gi < groups.length - 1) {
      setGi(gi + 1);
      setSi(0);
    } else {
      onClose();
    }
  };

  const prev = () => {
    if (si > 0) {
      setSi(si - 1);
    } else if (gi > 0) {
      const pg = groups[gi - 1];
      setGi(gi - 1);
      setSi(Math.max(0, (pg?.stories.length ?? 1) - 1));
    }
  };

  const menuOpenRef = useRef(false);
  menuOpenRef.current = menuOpen;

  // Pause playback while the options sheet is open (like Facebook).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (menuOpen || reactorsOpen) v.pause();
    else v.play().catch(() => {});
  }, [menuOpen, reactorsOpen]);


  useEffect(() => {
    if (!story) return;
    onStoryViewed(story.id);
    setProgress(0);
    if (story.mediaType === "video") {
      const v = videoRef.current;
      v?.play().catch(() => {});
      return;
    }
    let last = Date.now();
    let elapsed = 0;
    const timer = setInterval(() => {
      const now = Date.now();
      const delta = now - last;
      last = now;
      if (menuOpenRef.current || reactorsOpenRef.current) return;
      elapsed += delta;
      const p = elapsed / STORY_DURATION;
      if (p >= 1) {
        clearInterval(timer);
        next();
      } else {
        setProgress(p);
      }
    }, 50);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gi, si, story?.id]);


  if (!group || !story) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black flex items-center justify-center">
      <div className="relative w-full max-w-md h-full sm:h-[90vh] bg-black sm:rounded-2xl overflow-hidden">
        {/* progress bars */}
        <div className="absolute top-3 left-3 right-3 z-20 flex gap-1">
          {group.stories.map((s, i) => (
            <div key={s.id} className="flex-1 h-0.5 rounded bg-white/30 overflow-hidden">
              <div
                className="h-full bg-white"
                style={{
                  width: i < si ? "100%" : i === si ? `${progress * 100}%` : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* header */}
        <div className="absolute top-6 left-3 right-3 z-20 flex items-center gap-2">
          <Avatar uid={group.authorId} src={group.authorPhoto} alt={group.authorName} size={32} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">
              {group.authorName}
            </p>
            <p className="text-[11px] text-white/70">{timeAgo(story.createdAt)}</p>
          </div>
          <button
            onClick={() => { setMenuNote(""); setMenuOpen(true); }}
            aria-label="Story options"
            className="text-white/90 p-1"
          >
            <MoreVertical size={22} />
          </button>
          <button
            onClick={onClose}
            aria-label="Close stories"
            className="text-white/90 p-1"
          >
            <X size={24} />
          </button>
        </div>

        {/* Facebook-style story options sheet */}
        {menuOpen && (
          <div
            className="absolute inset-0 z-40 bg-black/50 flex items-end"
            onClick={() => setMenuOpen(false)}
          >
            <div
              className="w-full bg-white rounded-t-3xl p-2 pb-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto my-2 h-1 w-10 rounded-full bg-gray-300" />
              {menuNote && (
                <p className="px-4 py-2 text-sm text-sky-600">{menuNote}</p>
              )}
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(secureUrl(story.mediaUrl));
                    setMenuNote("Link copied");
                  } catch {
                    setMenuNote("Could not copy link");
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-900 active:bg-gray-50 rounded-2xl"
              >
                <Link2 size={20} />
                <span className="text-sm font-medium">Copy link</span>
              </button>
              <a
                href={secureUrl(story.mediaUrl)}
                target="_blank"
                rel="noreferrer"
                download
                className="w-full flex items-center gap-3 px-4 py-3 text-gray-900 active:bg-gray-50 rounded-2xl"
              >
                <Download size={20} />
                <span className="text-sm font-medium">
                  Save {story.mediaType === "video" ? "video" : "photo"}
                </span>
              </a>
              {user?.uid === story.authorId ? (
                <button
                  onClick={async () => {
                    try {
                      await deleteDoc(doc(db, "stories", story.id));
                      setMenuOpen(false);
                      next();
                    } catch {
                      setMenuNote("Could not delete story");
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-red-600 active:bg-red-50 rounded-2xl"
                >
                  <Trash2 size={20} />
                  <span className="text-sm font-medium">Delete story</span>
                </button>
              ) : (
                <button
                  onClick={() => setMenuNote("Thanks, we received your report")}
                  className="w-full flex items-center gap-3 px-4 py-3 text-gray-900 active:bg-gray-50 rounded-2xl"
                >
                  <Flag size={20} />
                  <span className="text-sm font-medium">Report story</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Who reacted sheet */}
        {reactorsOpen && (
          <div
            className="absolute inset-0 z-40 bg-black/50 flex items-end"
            onClick={() => setReactorsOpen(false)}
          >
            <div
              className="w-full max-h-[60%] overflow-y-auto bg-white rounded-t-3xl p-2 pb-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto my-2 h-1 w-10 rounded-full bg-gray-300" />
              <p className="px-4 pb-2 text-sm font-semibold text-gray-900">
                Reactions ({totalReactions})
              </p>
              {reactorsLoading ? (
                <div className="flex justify-center py-6 text-gray-400">
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : reactors.length === 0 ? (
                <p className="px-4 py-4 text-sm text-gray-500">No reactions yet</p>
              ) : (
                reactors.map((r) => (
                  <div
                    key={r.uid}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <Avatar src={r.photo} alt={r.name} size={36} />
                    <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900">
                      {r.name}
                    </span>
                    <span className="text-lg">{reactionGlyph(r.emoji)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}




        {/* media */}
        {story.musicUrl && (
          <audio key={story.id} src={secureUrl(story.musicUrl)} autoPlay loop className="hidden" />
        )}
        {story.musicUrl && (
          <div className="absolute top-16 left-3 z-20 flex items-center gap-1 text-white text-xs bg-black/40 rounded-full px-2 py-1 max-w-[70%]">
            <Music size={12} /> <span className="truncate">{story.musicName || "Music"}</span>
          </div>
        )}
        {story.mediaType === "video" ? (
          <video
            ref={videoRef}
            src={secureUrl(story.mediaUrl)}
            className="w-full h-full object-contain"
            playsInline
            onEnded={next}
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgress(v.currentTime / v.duration);
            }}
          />
        ) : (
          <img
            src={secureUrl(story.mediaUrl)}
            alt={`${group.authorName}'s story`}
            className="w-full h-full object-contain"
          />
        )}

        {/* tap zones */}
        <button
          aria-label="Previous story"
          onClick={prev}
          className="absolute left-0 top-0 bottom-0 w-1/3 z-10"
        />
        <button
          aria-label="Next story"
          onClick={next}
          className="absolute right-0 top-0 bottom-0 w-2/3 z-10"
        />

        {/* top & bottom gradients (Instagram-style readability) */}
        <div className="absolute top-0 left-0 right-0 h-28 z-10 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-32 z-10 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

        {/* reactions + reply bar */}
        <div className="absolute bottom-3 left-3 right-3 z-20 space-y-2">
          {reactionCounts.length > 0 && (
            <button
              onClick={() => {
                if (user?.uid === story.authorId) setReactorsOpen(true);
              }}
              aria-label={
                user?.uid === story.authorId ? "See who reacted" : "Reactions"
              }
              className="flex gap-1.5 flex-wrap items-center text-left"
            >
              {reactionCounts.map(([emoji, count]) => (
                <span
                  key={emoji}
                  className="bg-white/20 backdrop-blur rounded-full px-2 py-0.5 text-base text-white flex items-center gap-1"
                >
                  {reactionGlyph(emoji)}
                  <span className="text-xs font-semibold">{count}</span>
                </span>
              ))}
              {user?.uid === story.authorId && (
                <span className="text-[11px] text-white/70 ml-1 underline">
                  {totalReactions} reaction{totalReactions === 1 ? "" : "s"}
                </span>
              )}
            </button>
          )}


          {showReactions && (
            <div className="flex items-center justify-between bg-white/10 backdrop-blur rounded-full px-3 py-1.5">
              {REACTION_EMOJIS.map((emoji) => {
                const mine = myReaction === emoji;
                return (
                  <button
                    key={emoji}
                    aria-label={mine ? `Remove ${emoji} reaction` : `React ${emoji}`}
                    onClick={() => {
                      if (!user) return;
                      reactToStory(story.id, user.uid, emoji, myReaction).catch(
                        () => {},
                      );
                    }}
                    className={`text-2xl leading-none transition-transform active:scale-125 ${
                      mine ? "scale-125 drop-shadow" : "opacity-80"
                    }`}
                  >
                    {reactionGlyph(emoji)}
                  </button>
                );
              })}
            </div>
          )}

          {/* Instagram-style bar: message pill + quick actions */}
          <div className="flex items-center gap-3">
            {user && user.uid !== story.authorId ? (
              <>
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendReply();
                  }}
                  placeholder="Add a comment..."
                  className="flex-1 min-w-0 h-11 px-4 rounded-full bg-transparent border border-white/60 text-sm text-white placeholder-white/80 outline-none focus:border-white"
                />
                <button
                  onClick={() => {
                    if (!user) return;
                    reactToStory(story.id, user.uid, "Love", myReaction).catch(
                      () => {},
                    );
                  }}
                  aria-label={myReaction === "Love" ? "Remove like" : "Like story"}
                  className="text-white active:scale-90 transition-transform"
                >
                  <Heart
                    size={24}
                    fill={myReaction === "Love" ? "currentColor" : "none"}
                  />
                </button>
                <button
                  onClick={() => setShowReactions((v) => !v)}
                  aria-label="More reactions"
                  className="text-white active:scale-90 transition-transform"
                >
                  <SmilePlus size={24} />
                </button>
                <button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  aria-label="Send reply"
                  className="text-white disabled:opacity-40 active:scale-90 transition-transform"
                >
                  {sending ? (
                    <Loader2 size={22} className="animate-spin" />
                  ) : (
                    <Send size={22} />
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowReactions((v) => !v)}
                aria-label="Reactions"
                className="ml-auto text-white active:scale-90 transition-transform"
              >
                <SmilePlus size={24} />
              </button>
            )}
          </div>
          {replySent && (
            <p className="text-[11px] text-white/80 text-center">Comment sent ✓</p>
          )}
        </div>

      </div>
    </div>
  );
}

export function StoriesBar() {
  const { user, profile, ensureUserProfile } = useAuth();
  const { stories, loading } = useStories();
  const [adding, setAdding] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteView, setNoteView] = useState<UserNote | null>(null);

  useEffect(() => subscribeNotes(setNotes), []);


  // Seen status is stored on the user profile in Firestore so it stays
  // correct across devices; localStorage is only an instant local cache.
  useEffect(() => {
    setViewedIds(new Set(readViewedIds()));
  }, []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (!snap.exists()) return;
      const ids = (snap.data()["viewedStoryIds"] as string[] | undefined) ?? [];
      setViewedIds((prev) => {
        const merged = new Set(prev);
        ids.forEach((id) => merged.add(id));
        return merged;
      });
    });
  }, [user]);

  const markViewed = (storyId: string) => {
    setViewedIds((prev) => {
      if (prev.has(storyId)) return prev;
      const nextSet = new Set(prev);
      nextSet.add(storyId);
      try {
        localStorage.setItem(
          VIEWED_KEY,
          JSON.stringify([...readViewedIds(), storyId].slice(-500)),
        );
      } catch {
        /* ignore */
      }
      return nextSet;
    });
    if (user) {
      setDoc(
        doc(db, "users", user.uid),
        { viewedStoryIds: arrayUnion(storyId) },
        { merge: true },
      ).catch(() => {});
    }
  };


  const groups = useMemo<StoryGroup[]>(() => {
    const map = new Map<string, StoryGroup>();
    for (const s of stories) {
      const g = map.get(s.authorId);
      if (g) {
        g.stories.push(s);
      } else {
        map.set(s.authorId, {
          authorId: s.authorId,
          authorName: s.authorName,
          authorPhoto: s.authorPhoto,
          stories: [s],
        });
      }
    }
    // oldest first inside each group so viewing starts at the first story
    const arr = [...map.values()];
    arr.forEach((g) => g.stories.sort((a, b) => a.createdAt - b.createdAt));
    return arr;
  }, [stories]);

  const myNote = notes.find((n) => n.uid === user?.uid) ?? null;
  const noteFor = (uid: string) => notes.find((n) => n.uid === uid) ?? null;
  const noteOnly = notes.filter(
    (n) => n.uid !== user?.uid && !groups.some((g) => g.authorId === n.uid),
  );

  return (
    <>
      <div className="flex gap-3 overflow-x-auto px-4 py-3 border-b border-gray-100">
        {/* your story */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <button
            onClick={() => {
              setNoteDraft(myNote?.text ?? "");
              setNoteOpen(true);
            }}
            className="max-w-[92px] rounded-2xl rounded-bl-sm bg-gray-100 px-2.5 py-1 text-[10px] leading-tight text-gray-600 line-clamp-2 text-left"
          >
            {myNote?.text || "Post a note..."}
          </button>
          <button
            onClick={() => setAdding(true)}
            className="flex flex-col items-center gap-1"
          >
            <div className="relative">
              <div className="p-[2px] rounded-full bg-gray-200">
                <Avatar
                  uid={user?.uid}
                  src={profile?.photoURL ?? ""}
                  alt="Your story"
                  size={56}
                  className="ring-2 ring-white"
                />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-sky-500 border-2 border-white flex items-center justify-center text-white">
                <Plus size={12} strokeWidth={3} />
              </div>
            </div>
            <span className="text-[11px] text-gray-600 w-16 truncate text-center">
              Your story
            </span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center px-4">
            <Loader2 size={18} className="animate-spin text-sky-400" />
          </div>
        ) : (
          groups.map((g, i) => {
            const hasUnviewed = g.stories.some((s) => !viewedIds.has(s.id));
            const note = noteFor(g.authorId);
            return (
              <div
                key={g.authorId}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                {note && g.authorId !== user?.uid ? (
                  <button
                    onClick={() => setNoteView(note)}
                    className="max-w-[92px] rounded-2xl rounded-bl-sm bg-gray-100 px-2.5 py-1 text-[10px] leading-tight text-gray-600 line-clamp-2 text-left"
                  >
                    {note.text}
                  </button>
                ) : (
                  <span className="h-[26px]" />
                )}
                <button
                  onClick={() => setViewer(i)}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className={`p-[2px] rounded-full ${
                      hasUnviewed
                        ? "bg-gradient-to-tr from-sky-400 via-cyan-400 to-fuchsia-400"
                        : "bg-gray-300"
                    }`}
                  >
                    <Avatar
                      uid={g.authorId}
                      src={g.authorPhoto}
                      alt={`${g.authorName}'s story`}
                      size={56}
                      className="ring-2 ring-white"
                    />
                  </div>
                  <span className="text-[11px] text-gray-600 w-16 truncate text-center">
                    {g.authorId === user?.uid ? "You" : g.authorName}
                  </span>
                </button>
              </div>
            );
          })
        )}

        {noteOnly.map((n) => (
          <div key={n.uid} className="flex flex-col items-center gap-1 shrink-0">
            <button
              onClick={() => setNoteView(n)}
              className="max-w-[92px] rounded-2xl rounded-bl-sm bg-gray-100 px-2.5 py-1 text-[10px] leading-tight text-gray-600 line-clamp-2 text-left"
            >
              {n.text}
            </button>
            <button
              onClick={() => setNoteView(n)}
              className="flex flex-col items-center gap-1"
            >
              <div className="p-[2px] rounded-full bg-gray-200">
                <Avatar
                  uid={n.uid}
                  src={n.authorPhoto}
                  alt={n.authorName}
                  size={56}
                  className="ring-2 ring-white"
                />
              </div>
              <span className="text-[11px] text-gray-600 w-16 truncate text-center">
                {n.authorName}
              </span>
            </button>
          </div>
        ))}
      </div>

      {noteOpen && (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">New note</h2>
              <button
                onClick={() => setNoteOpen(false)}
                className="text-gray-400"
                aria-label="Close"
              >
                <X size={22} />
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Share what's on your mind — it disappears after 24 hours.
            </p>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value.slice(0, NOTE_MAX))}
              rows={3}
              autoFocus
              placeholder="Post a note..."
              className="w-full rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none"
            />
            <div className="mt-1 text-right text-[11px] text-gray-400">
              {noteDraft.length}/{NOTE_MAX}
            </div>
            <div className="mt-3 flex gap-2">
              {myNote && (
                <button
                  onClick={async () => {
                    if (!user) return;
                    setNoteBusy(true);
                    try {
                      await deleteNote(user.uid);
                      setNoteOpen(false);
                    } finally {
                      setNoteBusy(false);
                    }
                  }}
                  disabled={noteBusy}
                  className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-red-500 disabled:opacity-50"
                >
                  Delete
                </button>
              )}
              <button
                onClick={async () => {
                  if (!user || !noteDraft.trim()) return;
                  setNoteBusy(true);
                  try {
                    const profile = await ensureUserProfile();
                    await saveNote(
                      profile.uid,
                      noteDraft,
                      profile.displayName,
                      profile.photoURL,
                    );
                    setNoteOpen(false);
                  } finally {
                    setNoteBusy(false);
                  }
                }}
                disabled={noteBusy || !noteDraft.trim()}
                className="flex-1 rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {noteBusy ? "Sharing..." : "Share"}
              </button>
            </div>
          </div>
        </div>
      )}

      {noteView && (
        <div
          className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={() => setNoteView(null)}
        >
          <div
            className="w-full max-w-xs rounded-3xl bg-white p-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar
              uid={noteView.uid}
              src={noteView.authorPhoto}
              alt={noteView.authorName}
              size={56}
              className="mx-auto"
            />
            <p className="mt-3 text-sm font-semibold text-gray-900">
              {noteView.authorName}
            </p>
            <p className="mt-2 rounded-2xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
              {noteView.text}
            </p>
            <p className="mt-2 text-[11px] text-gray-400">
              {timeAgo(noteView.createdAt)} ago
            </p>
          </div>
        </div>
      )}

      {adding && <AddStoryModal onClose={() => setAdding(false)} />}
      {viewer !== null && (
        <StoryViewer
          groups={groups}
          startGroup={viewer}
          onClose={() => setViewer(null)}
          onStoryViewed={markViewed}
        />
      )}
    </>
  );
}
