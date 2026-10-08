import { useEffect, useState } from "react";
import { ImagePlus, Loader2, UserPlus, X } from "lucide-react";
import { addDoc, collection, getDocs, limit, query, serverTimestamp } from "firebase/firestore";
import { db, isVideoFile, uploadToCloudinary } from "../../lib/firebase";
import { useAuth } from "./AuthContext";
import { notifyUpload } from "../../lib/appNotifications";
import { POST_BACKGROUNDS, getPostBackground } from "./postBackgrounds";

export function CreatePostModal({ onClose }: { onClose: () => void }) {
  const { ensureUserProfile, profile } = useAuth();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [friends, setFriends] = useState<{ uid: string; name: string; photo: string }[]>([]);
  const [tagged, setTagged] = useState<{ uid: string; name: string }[]>([]);
  const [showTag, setShowTag] = useState(false);
  const [tagSearch, setTagSearch] = useState("");

  useEffect(() => {
    if (!showTag || friends.length || !profile) return;
    const mine = new Set([...(profile.following ?? []), ...(profile.followers ?? [])]);
    void getDocs(query(collection(db, "users"), limit(300))).then((snap) => {
      setFriends(
        snap.docs
          .filter((d) => d.id !== profile.uid && mine.has(d.id))
          .map((d) => {
            const x = d.data() as Record<string, unknown>;
            return { uid: d.id, name: String(x["displayName"] ?? "User"), photo: String(x["photoURL"] ?? "") };
          }),
      );
    });
  }, [showTag, friends.length, profile]);
  const [text, setText] = useState("");
  const tags = "";
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exclusive, setExclusive] = useState(false);
  const [bgId, setBgId] = useState<string | null>(null);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const bg = bgId && !file ? getPostBackground(bgId) : null;

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!picked.length) return;
    const all = [...files, ...picked].slice(0, 20);
    setFiles(all);
    setPreviews(all.map((f) => URL.createObjectURL(f)));
    setFile(all[0]!);
    setPreview(URL.createObjectURL(all[0]!));
    setBgId(null);
  };
  const removeAt = (i: number) => {
    const all = files.filter((_, j) => j !== i);
    setFiles(all);
    setPreviews(all.map((f) => URL.createObjectURL(f)));
    setFile(all[0] ?? null);
    setPreview(all[0] ? URL.createObjectURL(all[0]) : "");
  };

  const submit = async () => {
    if (!text.trim() && !file) return;
    setBusy(true);
    setError("");
    try {
      const profile = await ensureUserProfile();
      let mediaUrl = "";
      let mediaType = "";
      const media: { url: string; type: string }[] = [];
      for (const f of files) {
        const uploaded = await uploadToCloudinary(f);
        media.push({ url: uploaded.url, type: uploaded.resourceType || (isVideoFile(f) ? "video" : "image") });
      }
      if (media[0]) {
        mediaUrl = media[0].url;
        mediaType = media[0].type;
      }
      const isReel = mediaType === "video";
      await addDoc(collection(db, "posts"), {
        authorId: profile.uid,
        authorName: profile.displayName,
        authorUsername: profile.username,
        authorPhoto: profile.photoURL,
        text: text.trim(),
        mediaUrl,
        mediaType,
        media: media.length > 1 ? media : [],
        taggedUsers: tagged,
        bgStyle: bg && bg.id !== "plain" ? bg.id : "",
        exclusive,
        likes: [],
        comments: [],
        tags: tags
          .split(/[,#\s]+/)
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 8),
        createdAt: serverTimestamp(),
      });
      void notifyUpload({
        type: isReel ? "reel" : "post",
        actorId: profile.uid,
        actorName: profile.displayName,
        actorPhoto: profile.photoURL,
        followers: profile.followers,
        text: text.trim(),
        mediaUrl: mediaType === "image" ? mediaUrl : "",
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish post");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">New post</h2>
          <button onClick={onClose} className="text-gray-400" aria-label="Close">
            <X size={22} />
          </button>
        </div>
        {bg ? (
          <div
            className="w-full rounded-2xl min-h-44 flex items-center justify-center p-4"
            style={{ background: bg.background }}
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="What's happening?"
              className="w-full bg-transparent text-center text-xl font-bold outline-none resize-none placeholder:opacity-70"
              style={{ color: bg.textColor }}
            />
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="What's happening?"
            className="w-full p-3 rounded-2xl bg-gray-50 border border-gray-100 text-gray-900 outline-none focus:border-sky-300 resize-none"
          />
        )}
        {!file && (
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => setShowBgPicker((v) => !v)}
              aria-label="Text background"
              className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold border shadow-sm shrink-0 ${
                showBgPicker || bgId
                  ? "bg-gradient-to-br from-sky-400 to-fuchsia-500 text-white border-transparent"
                  : "bg-white text-gray-700 border-gray-200"
              }`}
            >
              Aa
            </button>
            {showBgPicker && (
              <div className="flex items-center gap-2 overflow-x-auto flex-1 py-1">
                {POST_BACKGROUNDS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBgId(b.id === "plain" ? null : b.id)}
                    aria-label={b.label}
                    className={`w-8 h-8 rounded-lg shrink-0 border shadow-sm transition-transform active:scale-90 ${
                      (bgId ?? "plain") === b.id
                        ? "ring-2 ring-sky-500 ring-offset-1"
                        : "border-gray-200"
                    }`}
                    style={{ background: b.swatch }}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {previews.length > 0 && (
          <div className={`mt-3 grid gap-1 max-h-64 overflow-y-auto rounded-2xl ${previews.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
            {previews.map((src, i) => (
              <div key={src} className={`relative bg-gray-100 overflow-hidden ${previews.length === 1 ? "max-h-60" : "aspect-square"}`}>
                {isVideoFile(files[i]!) ? (
                  <video src={src} muted className="w-full h-full object-cover" />
                ) : (
                  <img src={src} alt="preview" className="w-full h-full object-cover" />
                )}
                <button type="button" onClick={() => removeAt(i)} aria-label="Remove" className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {tagged.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tagged.map((t) => (
              <span key={t.uid} className="text-xs bg-sky-50 text-sky-700 rounded-full pl-2 pr-1 py-0.5 flex items-center gap-1">
                {t.name}
                <button type="button" onClick={() => setTagged((p) => p.filter((x) => x.uid !== t.uid))}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        {showTag && (
          <div className="mt-2 rounded-2xl border border-gray-100 p-2">
            <input value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="Search friends..." className="w-full px-3 py-2 rounded-xl bg-gray-50 text-sm outline-none" />
            <div className="max-h-40 overflow-y-auto mt-1">
              {friends.length === 0 && <p className="text-xs text-gray-400 p-2">No friends found</p>}
              {friends
                .filter((f) => f.name.toLowerCase().includes(tagSearch.toLowerCase()))
                .map((f) => {
                  const on = tagged.some((t) => t.uid === f.uid);
                  return (
                    <button key={f.uid} type="button" onClick={() => setTagged((p) => (on ? p.filter((x) => x.uid !== f.uid) : [...p, { uid: f.uid, name: f.name }]))} className={`w-full flex items-center gap-2 p-2 rounded-xl text-left text-sm ${on ? "bg-sky-50" : ""}`}>
                      {f.photo ? <img src={f.photo} alt="" className="w-7 h-7 rounded-full object-cover" /> : <span className="w-7 h-7 rounded-full bg-gray-200" />}
                      <span className="flex-1 text-gray-800">{f.name}</span>
                      {on && <span className="text-sky-500 text-xs font-semibold">✓</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        )}
        {error && (
          <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2 mt-3">
            {error}
          </p>
        )}
        <label className="mt-3 flex items-center justify-between rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2.5 cursor-pointer">
          <span className="text-sm font-semibold text-amber-700">
            👑 VIP subscribers only
          </span>
          <input
            type="checkbox"
            checked={exclusive}
            onChange={(e) => setExclusive(e.target.checked)}
            className="w-4 h-4 accent-amber-500"
          />
        </label>
        <div className="flex items-center justify-between mt-4">
          <label className="flex items-center gap-2 text-sky-500 font-medium cursor-pointer">
            <ImagePlus size={20} />
            <span className="text-sm">Photo / Video</span>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={pick}
              className="hidden"
            />
          </label>
          <button type="button" onClick={() => setShowTag((v) => !v)} className="flex items-center gap-1.5 text-sky-500 font-medium text-sm">
            <UserPlus size={19} /> Tag
          </button>
          <button
            onClick={submit}
            disabled={busy || (!text.trim() && !file)}
            className="h-10 px-6 rounded-2xl bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
