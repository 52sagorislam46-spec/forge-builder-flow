import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Star, Wallet, CheckCircle2, Clock } from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  where,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "./AuthContext";
import { AddMoneyCard } from "./AddMoneyCard";

/** How many taka one received star is worth. */
export const TAKA_PER_STAR = 0.5;
/** Minimum balance (taka) needed before a cash out can be requested. */
export const MIN_CASHOUT = 500;
export const METHODS = ["bKash", "Nagad", "Rocket"] as const;

export const formatTaka = (n: number) =>
  `৳${n.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface Withdrawal {
  id: string;
  uid: string;
  displayName: string;
  username: string;
  method: string;
  number: string;
  amount: number;
  stars: number;
  status: "pending" | "paid";
  createdAt: number;
  paidAt?: number;
}

export function WalletPage({ onBack }: { onBack: () => void }) {
  const { user, profile } = useAuth();
  const [data, setData] = useState<{ stars?: number; starsReceived?: number; starsWithdrawn?: number; walletBalance?: number } | null>(null);
  const [history, setHistory] = useState<Withdrawal[]>([]);
  const [method, setMethod] = useState<string>("bKash");
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!user) return;
    const u1 = onSnapshot(doc(db, "users", user.uid), (s) => setData((s.data() as typeof data) ?? {}));
    const u2 = onSnapshot(
      query(collection(db, "withdrawals"), where("uid", "==", user.uid)),
      (s) =>
        setHistory(
          s.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<Withdrawal, "id">) }))
            .sort((a, b) => b.createdAt - a.createdAt),
        ),
    );
    return () => {
      u1();
      u2();
    };
  }, [user]);

  const received = data?.starsReceived ?? 0;
  const withdrawn = data?.starsWithdrawn ?? 0;
  const available = Math.max(0, received - withdrawn);
  const walletBal = Math.max(0, data?.walletBalance ?? 0);
  const taka = available * TAKA_PER_STAR + walletBal;
  const canCashOut = taka >= MIN_CASHOUT;
  const validNumber = /^01[3-9]\d{8}$/.test(number.trim());

  const submit = async () => {
    if (!user || busy || !canCashOut || !validNumber) return;
    setBusy(true);
    setMsg("");
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "users", user.uid);
        const snap = await tx.get(ref);
        const d = (snap.data() ?? {}) as { starsReceived?: number; starsWithdrawn?: number; walletBalance?: number };
        const avail = Math.max(0, (d.starsReceived ?? 0) - (d.starsWithdrawn ?? 0));
        const bal = Math.max(0, d.walletBalance ?? 0);
        const amount = avail * TAKA_PER_STAR + bal;
        if (amount < MIN_CASHOUT) throw new Error("low");
        tx.set(ref, { starsWithdrawn: (d.starsWithdrawn ?? 0) + avail, walletBalance: 0 }, { merge: true });
        tx.set(doc(collection(db, "withdrawals")), {
          uid: user.uid,
          displayName: profile?.displayName ?? "",
          username: profile?.username ?? "",
          method,
          number: number.trim(),
          amount,
          stars: avail,
          status: "pending",
          createdAt: Date.now(),
        });
      });
      setNumber("");
      setMsg("রিকোয়েস্ট পাঠানো হয়েছে! অ্যাডমিন শীঘ্রই টাকা পাঠাবেন।");
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      setMsg(
        m === "low"
          ? `কমপক্ষে ${formatTaka(MIN_CASHOUT)} দরকার।`
          : /permission/i.test(m)
            ? "অনুমতি নেই — Firestore rules-এ withdrawals কালেকশন চালু করতে হবে।"
            : "পাঠানো যায়নি, আবার চেষ্টা করুন।",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-20 min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-xl border-b border-gray-100 h-14 px-4 flex items-center gap-3">
        <button onClick={onBack} aria-label="Back" className="text-gray-600">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-gray-900">My Wallet</h1>
      </header>

      <div className="p-4 space-y-4">
        <div className="rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 p-5 text-white shadow-lg">
          <div className="flex items-center gap-2 text-sm opacity-90">
            <Wallet size={16} /> উত্তোলনযোগ্য ব্যালেন্স
          </div>
          <p className="text-3xl font-bold mt-1">{data ? formatTaka(taka) : "…"}</p>
          <p className="text-xs mt-1 opacity-90 flex items-center gap-1">
            <Star size={12} className="fill-white" /> {available.toLocaleString()} স্টার × {formatTaka(TAKA_PER_STAR)}
          </p>
          <p className="text-xs mt-1 opacity-90">👑 ওয়ালেট ব্যালেন্স (VIP আয় সহ): {formatTaka(walletBal)}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-white/20 p-2">
              <p className="opacity-80">মোট পাওয়া স্টার</p>
              <p className="font-semibold text-sm">{received.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-white/20 p-2">
              <p className="opacity-80">পাঠানোর জন্য স্টার</p>
              <p className="font-semibold text-sm">{(data?.stars ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </div>

        <AddMoneyCard />

        <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-900">Cash Out</h2>
          {!canCashOut ? (
            <>
              <p className="text-sm text-gray-500">
                {formatTaka(MIN_CASHOUT)} বা তার বেশি হলে টাকা তুলতে পারবেন। আরও {formatTaka(Math.max(0, MIN_CASHOUT - taka))} দরকার।
              </p>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, (taka / MIN_CASHOUT) * 100)}%` }} />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethod(m)}
                    className={`h-10 rounded-xl text-sm font-semibold border ${
                      method === m ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/[^\d]/g, "").slice(0, 11))}
                inputMode="numeric"
                placeholder={`${method} নাম্বার (01XXXXXXXXX)`}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-amber-400"
              />
              <button
                onClick={() => void submit()}
                disabled={busy || !validNumber}
                className="w-full h-11 rounded-xl bg-amber-500 text-white font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {formatTaka(taka)} Cash Out
              </button>
            </>
          )}
          {msg && <p className="text-sm text-gray-700">{msg}</p>}
        </div>

        <div className="rounded-2xl bg-white border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-900 mb-2">রিকোয়েস্টের ইতিহাস</h2>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">এখনো কোনো রিকোয়েস্ট নেই।</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {history.map((w) => (
                <li key={w.id} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-900">{formatTaka(w.amount)} · {w.method}</p>
                    <p className="text-xs text-gray-400">{w.number} · {new Date(w.createdAt).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge status={w.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: "pending" | "paid" }) {
  return status === "paid" ? (
    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
      <CheckCircle2 size={12} /> Paid
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
      <Clock size={12} /> Pending
    </span>
  );
}
