import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { reviewBoost, useBoostPosts } from "./boost";
import { notifyAdminNotice } from "../../lib/appNotifications";
import type { Post } from "./types";

export function BoostRequestsPage({ onBack }: { onBack: () => void }) {
  const items = useBoostPosts("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (p: Post, approve: boolean) => {
    setBusyId(p.id);
    try {
      await reviewBoost(p, approve);
      await notifyAdminNotice({
        uid: p.authorId,
        title: approve ? "Boost approved" : "Boost rejected",
        text: approve
          ? `আপনার পোস্ট ${p.boostDays ?? 1} দিনের জন্য Sponsored হিসেবে দেখানো হচ্ছে।`
          : "আপনার বুস্ট আবেদন গ্রহণ করা হয়নি।",
      }).catch(() => {});
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="pb-20 min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-xl border-b border-gray-100 h-14 px-4 flex items-center gap-3">
        <button onClick={onBack} aria-label="Back" className="text-gray-600">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-gray-900">Boost Requests</h1>
      </header>
      <div className="p-4 space-y-3">
        {items === null ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-sky-500" /></div>
        ) : items.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">কোনো বুস্ট আবেদন নেই।</p>
        ) : (
          items
            .sort((a, b) => (b.boostRequestedAt ?? 0) - (a.boostRequestedAt ?? 0))
            .map((p) => (
              <div key={p.id} className="rounded-2xl bg-white border border-gray-100 p-4 space-y-2">
                <p className="font-semibold text-gray-900">{p.authorName} <span className="text-xs text-gray-400">@{p.authorUsername}</span></p>
                {p.text && <p className="text-sm text-gray-700 line-clamp-3">{p.text}</p>}
                {p.mediaUrl && (p.mediaType?.startsWith("video")
                  ? <video src={p.mediaUrl} className="w-full max-h-48 rounded-xl bg-black" />
                  : <img src={p.mediaUrl} alt="" className="w-full max-h-48 object-cover rounded-xl" />)}
                <p className="text-xs text-gray-500">সময়কাল: <b>{p.boostDays ?? 1} দিন</b></p>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={busyId === p.id} onClick={() => void act(p, true)} className="h-10 rounded-xl bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">Approve</button>
                  <button disabled={busyId === p.id} onClick={() => void act(p, false)} className="h-10 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold disabled:opacity-50">Reject</button>
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
