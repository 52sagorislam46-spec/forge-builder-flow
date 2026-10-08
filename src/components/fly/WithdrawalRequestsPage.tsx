import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { notifyAdminNotice } from "../../lib/appNotifications";
import { StatusBadge, formatTaka, type Withdrawal } from "./WalletPage";

export function WithdrawalRequestsPage({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<Withdrawal[] | null>(null);
  const [filter, setFilter] = useState<"pending" | "paid">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(
        collection(db, "withdrawals"),
        (s) =>
          setItems(
            s.docs
              .map((d) => ({ id: d.id, ...(d.data() as Omit<Withdrawal, "id">) }))
              .sort((a, b) => b.createdAt - a.createdAt),
          ),
        () => setItems([]),
      ),
    [],
  );

  const markPaid = async (w: Withdrawal) => {
    setBusyId(w.id);
    try {
      await updateDoc(doc(db, "withdrawals", w.id), { status: "paid", paidAt: Date.now() });
      await notifyAdminNotice({
        uid: w.uid,
        title: "Cash out paid",
        text: `আপনার ${w.method} (${w.number}) নাম্বারে ${formatTaka(w.amount)} পাঠানো হয়েছে।`,
      }).catch(() => {});
    } finally {
      setBusyId(null);
    }
  };

  const list = (items ?? []).filter((w) => w.status === filter);
  const pendingTotal = (items ?? []).filter((w) => w.status === "pending").reduce((s, w) => s + w.amount, 0);

  return (
    <div className="pb-20 min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-xl border-b border-gray-100 h-14 px-4 flex items-center gap-3">
        <button onClick={onBack} aria-label="Back" className="text-gray-600">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Withdrawal Requests</h1>
      </header>
      <div className="p-4 space-y-3">
        <p className="text-sm text-gray-500">মোট পেন্ডিং: <b className="text-gray-900">{formatTaka(pendingTotal)}</b></p>
        <div className="grid grid-cols-2 gap-2">
          {(["pending", "paid"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`h-10 rounded-xl text-sm font-semibold ${filter === f ? "bg-gray-900 text-white" : "bg-white text-gray-700 border border-gray-200"}`}
            >
              {f === "pending" ? "Pending" : "Paid"}
            </button>
          ))}
        </div>
        {items === null ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-sky-500" /></div>
        ) : list.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">কোনো রিকোয়েস্ট নেই।</p>
        ) : (
          list.map((w) => (
            <div key={w.id} className="rounded-2xl bg-white border border-gray-100 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{w.displayName || "Unknown"}</p>
                  <p className="text-xs text-gray-400">@{w.username}</p>
                </div>
                <StatusBadge status={w.status} />
              </div>
              <div className="text-sm text-gray-700">
                <p><b>{formatTaka(w.amount)}</b> ({w.stars.toLocaleString()} স্টার)</p>
                <p>{w.method}: <span className="font-mono">{w.number}</span></p>
                <p className="text-xs text-gray-400">{new Date(w.createdAt).toLocaleString()}</p>
              </div>
              {w.status === "pending" && (
                <button
                  onClick={() => void markPaid(w)}
                  disabled={busyId === w.id}
                  className="w-full h-10 rounded-xl bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {busyId === w.id ? "…" : "Mark as Paid"}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
