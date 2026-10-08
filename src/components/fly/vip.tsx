import { useEffect, useState } from "react";
import { Crown, Loader2, Lock } from "lucide-react";
import { arrayUnion, doc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "./AuthContext";

export const VIP_DAYS = 30;

/** True when `profile` holds an active monthly VIP membership for `creatorId`. */
export function isVipOf(profile: unknown, creatorId: string): boolean {
  const map = (profile as { vipOf?: Record<string, number> } | null)?.vipOf;
  const exp = map?.[creatorId];
  return typeof exp === "number" && exp > Date.now();
}

export function VipBadge() {
  return (
    <span
      title="VIP subscriber"
      className="inline-flex items-center gap-0.5 ml-1 align-middle rounded-full bg-gradient-to-r from-amber-300 to-yellow-500 px-1.5 py-[1px] text-[9px] font-bold text-white shadow-sm"
    >
      <Crown size={9} className="fill-white" /> VIP
    </span>
  );
}

export function LockedPost({ onOpen }: { onOpen?: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-3 w-full rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-yellow-50 p-6 flex flex-col items-center text-center gap-2"
    >
      <span className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 text-white flex items-center justify-center">
        <Lock size={20} />
      </span>
      <p className="text-sm font-bold text-gray-900">VIP exclusive post</p>
      <p className="text-xs text-gray-500">
        Subscribe to this creator to unlock exclusive content.
      </p>
    </button>
  );
}

export const VIP_DEFAULT_FEE = 100;
export const VIP_MIN_FEE = 100;
export const VIP_MAX_FEE = 1000;
/** Share of each subscription paid to the creator (rest is platform fee). */
export const VIP_CREATOR_SHARE = 0.8;

export function vipFeeOf(creator: unknown): number {
  const f = Number((creator as { vipFee?: number } | null)?.vipFee);
  if (!Number.isFinite(f) || f <= 0) return VIP_DEFAULT_FEE;
  return Math.min(VIP_MAX_FEE, Math.max(VIP_MIN_FEE, Math.round(f)));
}

/**
 * Pays the creator's monthly fee from the fan's wallet balance and activates
 * a VIP_DAYS membership. 80% goes to the creator's wallet.
 */
export async function subscribeVip(fanId: string, creatorId: string): Promise<"ok" | "insufficient"> {
  const fanRef = doc(db, "users", fanId);
  const crRef = doc(db, "users", creatorId);
  return runTransaction(db, async (tx) => {
    const fan = (await tx.get(fanRef)).data() ?? {};
    const cr = (await tx.get(crRef)).data() ?? {};
    const fee = vipFeeOf(cr);
    const bal = Number((fan as { walletBalance?: number }).walletBalance ?? 0);
    if (bal < fee) return "insufficient" as const;
    const cur = (fan as { vipOf?: Record<string, number> }).vipOf?.[creatorId] ?? 0;
    const start = Math.max(Date.now(), cur);
    tx.update(fanRef, {
      walletBalance: bal - fee,
      [`vipOf.${creatorId}`]: start + VIP_DAYS * 86400000,
    });
    tx.update(crRef, {
      walletBalance: Number((cr as { walletBalance?: number }).walletBalance ?? 0) + fee * VIP_CREATOR_SHARE,
      vipEarnings: Number((cr as { vipEarnings?: number }).vipEarnings ?? 0) + fee * VIP_CREATOR_SHARE,
      vipSubscribers: arrayUnion(fanId),
    });
    return "ok" as const;
  });
}

export const INSUFFICIENT_MSG =
  "ইনসাফিসিয়েন্ট ব্যালেন্স! আপনার ওয়ালেটে যথেষ্ট টাকা নেই — অনুগ্রহ করে ওয়ালেট রিচার্জ করুন।";

/** Blur/lock overlay shown on VIP-only reels for non-subscribers. */
export function ReelVipLock({ creatorId, creatorName }: { creatorId: string; creatorName: string }) {
  const { user, refreshProfile } = useAuth();
  const [fee, setFee] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    getDoc(doc(db, "users", creatorId)).then((s) => setFee(vipFeeOf(s.data()))).catch(() => setFee(VIP_DEFAULT_FEE));
  }, [creatorId]);
  const go = async () => {
    if (!user || busy) return;
    const f = fee ?? VIP_DEFAULT_FEE;
    if (!window.confirm(`${creatorName}-এর VIP মেম্বারশিপ (${VIP_DAYS} দিন) — ৳${f} আপনার ওয়ালেট থেকে কাটা হবে। নিশ্চিত?`)) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await subscribeVip(user.uid, creatorId);
      if (r === "insufficient") setMsg(INSUFFICIENT_MSG);
      else await refreshProfile();
    } catch {
      setMsg("সাবস্ক্রাইব করা যায়নি, আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-xl px-6 text-center">
      <span className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 text-white flex items-center justify-center">
        <Lock size={26} />
      </span>
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className="rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-5 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60 flex items-center gap-2"
      >
        {busy && <Loader2 size={16} className="animate-spin" />}
        🔒 VIP Exclusive - সাবস্ক্রাইব করে দেখুন
      </button>
      <p className="text-xs text-white/80">৳{fee ?? "…"} / মাস</p>
      {msg && <p className="text-xs font-semibold text-amber-200 max-w-xs">{msg}</p>}
    </div>
  );
}

/** Paid plans that unlock setting a custom VIP fee. */
export const VIP_FEE_PLANS = [
  { price: 100, days: 30, label: "১ মাস" },
  { price: 500, days: 180, label: "৬ মাস" },
  { price: 1000, days: 365, label: "১ বছর" },
] as const;

export function hasFeeAccess(profile: unknown): boolean {
  const u = Number((profile as { vipFeeAccessUntil?: number } | null)?.vipFeeAccessUntil ?? 0);
  return u > Date.now();
}

/** Buys a fee-setting plan from the creator's wallet balance. */
export async function buyFeePlan(uid: string, planIdx: number): Promise<"ok" | "insufficient"> {
  const plan = VIP_FEE_PLANS[planIdx]; if (!plan) return "insufficient";
  const ref = doc(db, "users", uid);
  return runTransaction(db, async (tx) => {
    const d = ((await tx.get(ref)).data() ?? {}) as { walletBalance?: number; vipFeeAccessUntil?: number };
    const bal = Number(d.walletBalance ?? 0);
    if (bal < plan.price) return "insufficient" as const;
    const start = Math.max(Date.now(), Number(d.vipFeeAccessUntil ?? 0));
    tx.update(ref, { walletBalance: bal - plan.price, vipFeeAccessUntil: start + plan.days * 86400000 });
    return "ok" as const;
  });
}
