import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BadgeDollarSign, ChevronRight, Crown, Gift, Loader2, Phone, Receipt, Search, Wallet } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Avatar } from "./Avatar";
import { WithdrawalRequestsPage } from "./WithdrawalRequestsPage";
import {
  grantFree,
  reviewRecharge,
  savePaymentSettings,
  setMonetization,
  setVipApproved,
  usePaymentSettings,
  type RechargeRequest,
} from "./monetization";

type U = {
  uid: string;
  username?: string;
  displayName?: string;
  photoURL?: string;
  email?: string;
  stars?: number;
  walletBalance?: number;
  monetizationStatus?: string | null;
  vipApproved?: boolean;
};
type Tab = null | "numbers" | "users" | "recharge" | "cashout";

function Shell({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="pb-20 min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-xl border-b border-gray-100 h-14 px-4 flex items-center gap-3">
        <button onClick={onBack} aria-label="Back" className="text-gray-600"><ArrowLeft size={22} /></button>
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      </header>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

export function MonetizationPanel({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>(null);
  const [pendingRecharge, setPendingRecharge] = useState(0);
  const [pendingMon, setPendingMon] = useState(0);

  useEffect(() => {
    const a = onSnapshot(collection(db, "rechargeRequests"), (s) =>
      setPendingRecharge(s.docs.filter((d) => d.data()["status"] === "pending").length), () => {});
    const b = onSnapshot(collection(db, "users"), (s) =>
      setPendingMon(s.docs.filter((d) => d.data()["monetizationStatus"] === "pending").length), () => {});
    return () => { a(); b(); };
  }, []);

  if (tab === "cashout") return <WithdrawalRequestsPage onBack={() => setTab(null)} />;
  if (tab === "numbers") return <NumbersTab onBack={() => setTab(null)} />;
  if (tab === "users") return <UsersTab onBack={() => setTab(null)} />;
  if (tab === "recharge") return <RechargeTab onBack={() => setTab(null)} />;

  const items: { t: Tab; icon: React.ReactNode; label: string; sub: string; badge?: number }[] = [
    { t: "numbers", icon: <Phone size={20} />, label: "বিকাশ / নগদ নম্বর", sub: "স্টার কেনা ও রিচার্জে দেখাবে" },
    { t: "users", icon: <Gift size={20} />, label: "ইউজার ম্যানেজ", sub: "ফ্রি স্টার/টাকা, মনিটাইজেশন ও VIP", badge: pendingMon },
    { t: "recharge", icon: <Receipt size={20} />, label: "Add Money রিকোয়েস্ট", sub: "TrxID যাচাই করে অনুমোদন", badge: pendingRecharge },
    { t: "cashout", icon: <Wallet size={20} />, label: "ক্যাশআউট রিকোয়েস্ট", sub: "ক্রিয়েটরদের উত্তোলন" },
  ];
  return (
    <Shell title="Monetization Control" onBack={onBack}>
      {items.map((i) => (
        <button key={i.t} onClick={() => setTab(i.t)} className="w-full flex items-center gap-3 rounded-2xl bg-white border border-gray-100 p-4 text-left">
          <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">{i.icon}</span>
          <span className="flex-1">
            <span className="block text-sm font-semibold text-gray-900">{i.label}</span>
            <span className="block text-xs text-gray-500">{i.sub}</span>
          </span>
          {!!i.badge && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">{i.badge}</span>}
          <ChevronRight size={18} className="text-gray-400" />
        </button>
      ))}
    </Shell>
  );
}

function NumbersTab({ onBack }: { onBack: () => void }) {
  const s = usePaymentSettings();
  const [bkash, setBkash] = useState("");
  const [nagad, setNagad] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { if (s) { setBkash(s.bkash ?? ""); setNagad(s.nagad ?? ""); } }, [s]);
  const valid = (n: string) => n === "" || /^01[3-9]\d{8}$/.test(n);
  const save = async () => {
    if (!valid(bkash) || !valid(nagad)) return setMsg("সঠিক ১১ ডিজিটের নম্বর দিন।");
    try { await savePaymentSettings({ bkash, nagad }); setMsg("সেভ হয়েছে ✓"); } catch { setMsg("সেভ করা যায়নি।"); }
  };
  const field = (label: string, v: string, set: (x: string) => void) => (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input value={v} onChange={(e) => set(e.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" placeholder="01XXXXXXXXX"
        className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-amber-400" />
    </label>
  );
  return (
    <Shell title="পেমেন্ট নম্বর" onBack={onBack}>
      <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3">
        {field("বিকাশ নম্বর", bkash, setBkash)}
        {field("নগদ নম্বর", nagad, setNagad)}
        <button onClick={() => void save()} className="w-full h-11 rounded-xl bg-amber-500 text-white font-semibold">Save</button>
        {msg && <p className="text-sm text-gray-600">{msg}</p>}
      </div>
    </Shell>
  );
}

function UsersTab({ onBack }: { onBack: () => void }) {
  const [users, setUsers] = useState<U[] | null>(null);
  const [q, setQ] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => onSnapshot(collection(db, "users"), (s) => setUsers(s.docs.map((d) => ({ ...(d.data() as U), uid: d.id }))), () => setUsers([])), []);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/^@/, "");
    return (users ?? [])
      .filter((u) => !onlyPending || u.monetizationStatus === "pending")
      .filter((u) => !t || [u.username, u.displayName, u.email].some((x) => (x ?? "").toLowerCase().includes(t)))
      .slice(0, 50);
  }, [users, q, onlyPending]);
  return (
    <Shell title="ইউজার ম্যানেজ" onBack={onBack}>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="নাম, @username বা ইমেইল"
          className="w-full h-11 pl-9 pr-3 rounded-xl border border-gray-200 bg-white text-sm outline-none focus:border-amber-400" />
      </div>
      <button onClick={() => setOnlyPending((v) => !v)} className={`h-9 px-3 rounded-full text-xs font-semibold ${onlyPending ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-700"}`}>
        শুধু মনিটাইজেশন আবেদন
      </button>
      {users === null ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-amber-500" /></div>
        : list.length === 0 ? <p className="text-center text-sm text-gray-400 py-10">কোনো ইউজার পাওয়া যায়নি।</p>
        : list.map((u) => <UserRow key={u.uid} u={u} open={open === u.uid} onToggle={() => setOpen(open === u.uid ? null : u.uid)} />)}
    </Shell>
  );
}

function UserRow({ u, open, onToggle }: { u: U; open: boolean; onToggle: () => void }) {
  const [stars, setStars] = useState("");
  const [taka, setTaka] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = async (f: () => Promise<void>, ok: string) => {
    setBusy(true); setMsg("");
    try { await f(); setMsg(ok); } catch { setMsg("হয়নি, আবার চেষ্টা করুন।"); } finally { setBusy(false); }
  };
  const s = Math.max(0, Math.floor(Number(stars) || 0));
  const t = Math.max(0, Number(taka) || 0);
  const mon = u.monetizationStatus;
  return (
    <div className="rounded-2xl bg-white border border-gray-100 p-3">
      <button onClick={onToggle} className="w-full flex items-center gap-3 text-left">
        <Avatar src={u.photoURL ?? ""} alt={u.displayName ?? ""} size={40} />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-gray-900 truncate">{u.displayName || "Unknown"}</span>
          <span className="block text-xs text-gray-400 truncate">@{u.username} · ⭐ {u.stars ?? 100} · ৳{(u.walletBalance ?? 0).toFixed(0)}</span>
        </span>
        {mon === "pending" && <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>}
        {mon === "approved" && <BadgeDollarSign size={16} className="text-emerald-500" />}
        {u.vipApproved && <Crown size={16} className="text-amber-500" />}
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={stars} onChange={(e) => setStars(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="ফ্রি স্টার"
              className="h-10 px-3 rounded-xl border border-gray-200 text-sm outline-none" />
            <input value={taka} onChange={(e) => setTaka(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="ওয়ালেট টাকা"
              className="h-10 px-3 rounded-xl border border-gray-200 text-sm outline-none" />
          </div>
          <button disabled={busy || (!s && !t)} onClick={() => void run(async () => { await grantFree(u.uid, s, t); setStars(""); setTaka(""); }, "উপহার পাঠানো হয়েছে ✓")}
            className="w-full h-10 rounded-xl bg-amber-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
            <Gift size={16} /> ফ্রিতে দিন
          </button>
          <div className="grid grid-cols-2 gap-2">
            {mon === "approved" ? (
              <button disabled={busy} onClick={() => void run(() => setMonetization(u.uid, null), "মনিটাইজেশন বন্ধ")} className="h-10 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold">মনিটাইজেশন বন্ধ</button>
            ) : (
              <button disabled={busy} onClick={() => void run(() => setMonetization(u.uid, "approved"), "মনিটাইজেশন চালু ✓")} className="h-10 rounded-xl bg-emerald-500 text-white text-xs font-semibold">মনিটাইজেশন অনুমোদন</button>
            )}
            <button disabled={busy} onClick={() => void run(() => setVipApproved(u.uid, !u.vipApproved), u.vipApproved ? "VIP বন্ধ" : "VIP অনুমোদিত ✓")}
              className={`h-10 rounded-xl text-xs font-semibold ${u.vipApproved ? "bg-gray-100 text-gray-700" : "bg-amber-100 text-amber-700"}`}>
              {u.vipApproved ? "VIP বন্ধ" : "VIP অনুমোদন"}
            </button>
          </div>
          {mon === "pending" && (
            <button disabled={busy} onClick={() => void run(() => setMonetization(u.uid, "rejected"), "আবেদন বাতিল")} className="w-full h-9 rounded-xl text-xs font-semibold text-red-500 bg-red-50">মনিটাইজেশন আবেদন বাতিল</button>
          )}
          {msg && <p className="text-xs text-gray-600">{msg}</p>}
        </div>
      )}
    </div>
  );
}

function RechargeTab({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<RechargeRequest[] | null>(null);
  const [filter, setFilter] = useState<RechargeRequest["status"]>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => onSnapshot(collection(db, "rechargeRequests"),
    (s) => setItems(s.docs.map((d) => ({ ...(d.data() as RechargeRequest), id: d.id })).sort((a, b) => b.createdAt - a.createdAt)),
    () => setItems([])), []);
  const act = async (r: RechargeRequest, ok: boolean) => {
    setBusyId(r.id);
    try { await reviewRecharge(r, ok); } catch { /* already reviewed */ } finally { setBusyId(null); }
  };
  const list = (items ?? []).filter((r) => r.status === filter);
  return (
    <Shell title="Add Money রিকোয়েস্ট" onBack={onBack}>
      <div className="grid grid-cols-3 gap-2">
        {(["pending", "approved", "rejected"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`h-10 rounded-xl text-sm font-semibold ${filter === f ? "bg-gray-900 text-white" : "bg-white text-gray-700 border border-gray-200"}`}>
            {f === "pending" ? "Pending" : f === "approved" ? "Approved" : "Rejected"}
          </button>
        ))}
      </div>
      {items === null ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-amber-500" /></div>
        : list.length === 0 ? <p className="text-center text-sm text-gray-400 py-10">কোনো রিকোয়েস্ট নেই।</p>
        : list.map((r) => (
          <div key={r.id} className="rounded-2xl bg-white border border-gray-100 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{r.displayName || "Unknown"}</p>
                <p className="text-xs text-gray-400">@{r.username}</p>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700">{r.kind === "stars" ? "⭐ স্টার কেনা" : "💰 ওয়ালেট"}</span>
            </div>
            <div className="text-sm text-gray-700 space-y-0.5">
              <p><b>৳{r.amount}</b> · {r.method}</p>
              <p>প্রেরক: <span className="font-mono">{r.sender}</span></p>
              <p>TrxID: <span className="font-mono font-semibold select-all">{r.trxId}</span></p>
              <p className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleString()}</p>
            </div>
            {r.status === "pending" && (
              <div className="grid grid-cols-2 gap-2">
                <button disabled={busyId === r.id} onClick={() => void act(r, true)} className="h-10 rounded-xl bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">Approve</button>
                <button disabled={busyId === r.id} onClick={() => void act(r, false)} className="h-10 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold disabled:opacity-50">Reject</button>
              </div>
            )}
          </div>
        ))}
    </Shell>
  );
}
