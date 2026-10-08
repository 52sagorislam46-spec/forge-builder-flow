import { useEffect, useState } from "react";
import { Star, X, Loader2 } from "lucide-react";
import { doc, onSnapshot, runTransaction, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "./AuthContext";
import { pushToUsers } from "../../lib/push";

/** Starting balance for accounts that have never had a star balance. */
export const STARTER_STARS = 100;
const AMOUNTS = [5, 10, 50, 100];

export function useStarBalance(uid?: string) {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid), (s) => {
      const v = (s.data() as { stars?: number } | undefined)?.stars;
      setStars(typeof v === "number" ? v : STARTER_STARS);
    });
  }, [uid]);
  return stars;
}

export function StarGiftButton({
  creatorId,
  creatorName,
  postId,
  variant = "post",
}: {
  creatorId: string;
  creatorName: string;
  postId: string;
  variant?: "post" | "reel";
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user || user.uid === creatorId) return null;
  return (
    <>
      {variant === "reel" ? (
        <button onClick={() => setOpen(true)} aria-label="Send Star" className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
          <Star size={28} className="text-amber-300 fill-amber-300" />
          <span className="text-xs font-medium">Star</span>
        </button>
      ) : (
        <button onClick={() => setOpen(true)} aria-label="Send Star" className="flex items-center gap-1.5 text-sm active:scale-90 transition-transform text-amber-500">
          <Star size={18} className="fill-amber-400" />
          <span>Star</span>
        </button>
      )}
      {open && <StarGiftDialog creatorId={creatorId} creatorName={creatorName} postId={postId} onClose={() => setOpen(false)} />}
    </>
  );
}

function StarGiftDialog({ creatorId, creatorName, postId, onClose }: { creatorId: string; creatorName: string; postId: string; onClose: () => void }) {
  const { user, profile } = useAuth();
  const balance = useStarBalance(user?.uid);
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!user || busy) return;
    setBusy(true);
    setError("");
    try {
      await runTransaction(db, async (tx) => {
        const meRef = doc(db, "users", user.uid);
        const creatorRef = doc(db, "users", creatorId);
        const [me, cr] = await Promise.all([tx.get(meRef), tx.get(creatorRef)]);
        const myStars = (me.data() as { stars?: number })?.stars ?? STARTER_STARS;
        if (myStars < amount) throw new Error("not-enough");
        const crData = cr.data() as { stars?: number; starsReceived?: number } | undefined;
        tx.set(meRef, { stars: myStars - amount }, { merge: true });
        tx.set(creatorRef, {
          stars: (crData?.stars ?? STARTER_STARS) + amount,
          starsReceived: (crData?.starsReceived ?? 0) + amount,
        }, { merge: true });
      });
      const name = profile?.displayName ?? "Someone";
      await addDoc(collection(db, "notifications"), {
        type: "gift",
        actorId: user.uid,
        actorName: name,
        actorPhoto: profile?.photoURL ?? "",
        text: `⭐ ${amount} stars`,
        mediaUrl: "",
        postId,
        stars: amount,
        recipients: [creatorId],
        readBy: [],
        createdAt: serverTimestamp(),
      }).catch(() => {});
      pushToUsers({ uids: [creatorId], title: name, body: `sent you ${amount} stars ⭐`, icon: profile?.photoURL ?? "", link: "/", tag: `gift_${user.uid}_${Date.now()}` }).catch(() => {});
      setSent(true);
      setTimeout(onClose, 1800);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      setError(msg === "not-enough" ? "পর্যাপ্ত স্টার নেই" : /permission/i.test(msg) ? "অনুমতি নেই — ডেটার নিয়ম (Firestore rules) আপডেট করতে হবে" : "পাঠানো যায়নি, আবার চেষ্টা করুন");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="w-full sm:max-w-sm bg-white text-gray-900 rounded-t-3xl sm:rounded-3xl p-5 relative overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 text-gray-400"><X size={20} /></button>
        {sent ? (
          <div className="py-8 flex flex-col items-center gap-3">
            <div className="relative">
              <Star size={72} className="text-amber-400 fill-amber-400 animate-bounce" />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Star key={i} size={16} className="absolute text-amber-300 fill-amber-300 animate-ping" style={{ left: `${36 + 50 * Math.cos(i)}px`, top: `${36 + 50 * Math.sin(i)}px`, animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
            <p className="font-bold text-lg">{amount} স্টার পাঠানো হয়েছে!</p>
            <p className="text-sm text-gray-500">{creatorName} কে ধন্যবাদ জানানো হলো</p>
          </div>
        ) : (
          <>
            <h3 className="font-bold text-lg flex items-center gap-2"><Star size={20} className="text-amber-400 fill-amber-400" /> Send Star</h3>
            <p className="text-sm text-gray-500 mt-1">{creatorName} কে স্টার উপহার দিন</p>
            <p className="mt-3 text-sm">আপনার ব্যালেন্স: <b className="text-amber-600">{balance ?? "…"} ⭐</b></p>
            <div className="grid grid-cols-4 gap-2 mt-4">
              {AMOUNTS.map((a) => (
                <button key={a} onClick={() => setAmount(a)} className={`py-3 rounded-2xl border-2 flex flex-col items-center font-semibold transition-all ${amount === a ? "border-amber-400 bg-amber-50 scale-105" : "border-gray-100"}`}>
                  <Star size={18} className="text-amber-400 fill-amber-400" />
                  {a}
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-rose-500 mt-3">{error}</p>}
            <button onClick={send} disabled={busy || balance === null || balance < amount} className="mt-5 w-full h-11 rounded-2xl bg-amber-400 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {busy && <Loader2 size={18} className="animate-spin" />} {amount} স্টার পাঠান
            </button>
          </>
        )}
      </div>
    </div>
  );
}
