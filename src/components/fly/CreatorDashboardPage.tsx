import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Circle,
  Eye,
  FileText,
  Film,
  Heart,
  Loader2,
  MessageCircle,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "./AuthContext";
import { Avatar } from "./Avatar";
import { formatViews } from "./views";
import { isVideoPost } from "./usePosts";

const FOLLOWER_GOAL = 20;
const POST_GOAL = 10;
const VIEWS_GOAL = 1000;
// Bonus (in Taka) credited for every 1,000 reel views.
const BONUS_PER_1000_VIEWS = 10;

function ProgressRow({
  icon,
  label,
  current,
  goal,
  format = (n: number) => n.toLocaleString(),
}: {
  icon: React.ReactNode;
  label: string;
  current: number;
  goal: number;
  format?: (n: number) => string;
}) {
  const pct = Math.min(100, Math.round((current / goal) * 100));
  const done = current >= goal;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center shrink-0">
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="text-xs text-gray-400">
            {format(current)} / {format(goal)}
          </p>
        </div>
        {done ? (
          <CheckCircle2 size={20} className="text-emerald-500 shrink-0" />
        ) : (
          <Circle size={20} className="text-gray-200 shrink-0" />
        )}
      </div>
      <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            done
              ? "bg-emerald-500"
              : "bg-gradient-to-r from-sky-400 to-cyan-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-gray-400 text-right">{pct}%</p>
    </div>
  );
}

export function CreatorDashboardPage({
  onBack,
  onOpenWallet,
}: {
  onBack?: () => void;
  onOpenWallet?: (() => void) | undefined;
}) {
  const { user, profile, refreshProfile } = useAuth();
  const [postCount, setPostCount] = useState(0);
  const [totalViews, setTotalViews] = useState(0);
  const [reelViews, setReelViews] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [reelCount, setReelCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setLoading(true);
    getDocs(query(collection(db, "posts"), where("authorId", "==", user.uid)))
      .then((snap) => {
        if (!alive) return;
        setPostCount(snap.size);
        setTotalViews(
          snap.docs.reduce((sum, d) => {
            const v = d.data()["views"];
            return sum + (typeof v === "number" ? v : 0);
          }, 0),
        );
        let likes = 0;
        let comments = 0;
        let reels = 0;
        snap.docs.forEach((d) => {
          const data = d.data();
          likes += Array.isArray(data["likes"]) ? data["likes"].length : 0;
          comments += Array.isArray(data["comments"]) ? data["comments"].length : 0;
          if (isVideoPost({ mediaType: data["mediaType"] ?? "", mediaUrl: data["mediaUrl"] ?? "" })) reels++;
        });
        setLikeCount(likes);
        setCommentCount(comments);
        setReelCount(reels);
        setReelViews(
          snap.docs.reduce((sum, d) => {
            const data = d.data();
            if (!isVideoPost({ mediaType: data["mediaType"] ?? "", mediaUrl: data["mediaUrl"] ?? "" })) return sum;
            const v = data["views"];
            return sum + (typeof v === "number" ? v : 0);
          }, 0),
        );
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  const monetizationStatus =
    (profile as { monetizationStatus?: string } | null)?.monetizationStatus ?? null;
  const bonusBalance = Math.floor(reelViews / 1000) * BONUS_PER_1000_VIEWS;

  // Keep the creator's bonus balance saved on their profile.
  useEffect(() => {
    if (!user || loading || monetizationStatus !== "approved") return;
    const saved = (profile as { bonusBalance?: number } | null)?.bonusBalance;
    if (saved === bonusBalance) return;
    updateDoc(doc(db, "users", user.uid), {
      bonusBalance,
      reelViews,
      bonusUpdatedAt: Date.now(),
    }).catch(() => {});
  }, [user, loading, monetizationStatus, bonusBalance, reelViews, profile]);

  if (!user || !profile) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-sky-500" />
      </div>
    );
  }

  const followers = profile.followers.length;
  const followersOk = followers >= FOLLOWER_GOAL;
  const postsOk = postCount >= POST_GOAL;
  const viewsOk = totalViews >= VIEWS_GOAL;
  const eligible = followersOk && postsOk && viewsOk;

  const apply = async () => {
    if (!eligible || applying) return;
    setApplying(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        monetizationStatus: "pending",
        monetizationAppliedAt: Date.now(),
      });
      await refreshProfile();
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="pb-20">
      <header className="sticky top-0 bg-white/90 backdrop-blur-xl border-b border-gray-100 px-4 h-14 flex items-center gap-3 z-10">
        {onBack && (
          <button onClick={onBack} aria-label="Back" className="text-gray-500">
            <ArrowLeft size={22} />
          </button>
        )}
        <h1 className="text-lg font-bold text-gray-900">Creator Dashboard</h1>
      </header>

      <section className="px-5 pt-6 pb-5 bg-gradient-to-b from-sky-50 to-white">
        <div className="flex items-center gap-3">
          <Avatar
            src={profile.photoURL}
            alt={profile.displayName}
            size={52}
            className="ring-4 ring-white"
          />
          <div className="min-w-0">
            <p className="text-base font-bold text-gray-900 truncate">
              {profile.displayName}
            </p>
            <p className="text-sm text-gray-400 truncate">
              @{profile.username}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white border border-gray-100 p-3 text-center">
            <p className="text-lg font-bold text-gray-900">
              {followers.toLocaleString()}
            </p>
            <p className="text-[11px] text-gray-400">Followers</p>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 p-3 text-center">
            <p className="text-lg font-bold text-gray-900">
              {loading ? "…" : postCount.toLocaleString()}
            </p>
            <p className="text-[11px] text-gray-400">Posts</p>
          </div>
          <div className="rounded-2xl bg-white border border-gray-100 p-3 text-center">
            <p className="text-lg font-bold text-gray-900">
              {loading ? "…" : formatViews(totalViews)}
            </p>
            <p className="text-[11px] text-gray-400">Views</p>
          </div>
        </div>
      </section>

      {monetizationStatus !== "approved" && (
      <section className="px-5 space-y-3">
        <h2 className="text-sm font-bold text-gray-900">
          Monetization eligibility
        </h2>
        <ProgressRow
          icon={<Users size={18} />}
          label="Followers"
          current={followers}
          goal={FOLLOWER_GOAL}
        />
        <ProgressRow
          icon={<FileText size={18} />}
          label="Posts"
          current={postCount}
          goal={POST_GOAL}
        />
        <ProgressRow
          icon={<Eye size={18} />}
          label="Total views"
          current={totalViews}
          goal={VIEWS_GOAL}
          format={formatViews}
        />

        <div
          className={`rounded-2xl border p-4 text-sm ${
            eligible
              ? "border-emerald-100 bg-emerald-50 text-emerald-700"
              : "border-gray-100 bg-gray-50 text-gray-500"
          }`}
        >
          {eligible
            ? "Congratulations! You meet all the requirements for monetization."
            : "Reach 20 followers, publish at least 10 posts and get 1,000 total views to unlock monetization."}
        </div>

        {monetizationStatus === "pending" ? (
          <div className="w-full h-12 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 font-semibold text-sm flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Application under review
          </div>
        ) : monetizationStatus === "approved" ? (
          <div className="w-full h-12 rounded-2xl bg-emerald-500 text-white font-semibold text-sm flex items-center justify-center gap-2">
            <BadgeCheck size={18} />
            Monetization active
          </div>
        ) : (
          <button
            onClick={() => void apply()}
            disabled={!eligible || applying}
            className={`w-full h-12 rounded-2xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              eligible
                ? "bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-200 active:scale-[0.98]"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {applying ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <BadgeCheck size={18} />
            )}
            {applying ? "Applying…" : "Apply for Monetization"}
          </button>
        )}
      </section>
      )}

      {monetizationStatus === "approved" && (
        <ProDashboard
          loading={loading}
          bonusBalance={bonusBalance}
          walletBalance={Number((profile as { walletBalance?: number }).walletBalance ?? 0)}
          reelViews={reelViews}
          totalViews={totalViews}
          followers={followers}
          postCount={postCount}
          reelCount={reelCount}
          likeCount={likeCount}
          commentCount={commentCount}
          onOpenWallet={onOpenWallet}
        />
      )}

      {false && (
        <section className="px-5 mt-6 space-y-3">
          <h2 className="text-sm font-bold text-gray-900">
            Reels Performance Bonus
          </h2>
          <div className="rounded-2xl p-5 bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-md">
            <div className="flex items-center gap-2 text-xs opacity-90">
              <Wallet size={14} /> Bonus balance
            </div>
            <p className="text-3xl font-bold mt-1">
              ৳{loading ? "…" : bonusBalance.toLocaleString()}
            </p>
            <p className="text-[11px] mt-1 opacity-90">
              ৳{BONUS_PER_1000_VIEWS} per 1,000 reel views
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="flex items-center gap-1.5 text-gray-400 text-[11px]">
                <Film size={13} /> Reel views
              </div>
              <p className="text-lg font-bold text-gray-900 mt-1">
                {loading ? "…" : formatViews(reelViews)}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="flex items-center gap-1.5 text-gray-400 text-[11px]">
                <Eye size={13} /> Next bonus in
              </div>
              <p className="text-lg font-bold text-gray-900 mt-1">
                {loading ? "…" : formatViews(1000 - (reelViews % 1000))}
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                style={{ width: `${Math.round(((reelViews % 1000) / 1000) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">
              {(reelViews % 1000).toLocaleString()} / 1,000 views to next ৳{BONUS_PER_1000_VIEWS}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4">
      <div className="flex items-center gap-1.5 text-gray-400 text-[11px]">
        {icon} {label}
      </div>
      <p className="text-lg font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

function ProDashboard(p: {
  loading: boolean;
  bonusBalance: number;
  walletBalance: number;
  reelViews: number;
  totalViews: number;
  followers: number;
  postCount: number;
  reelCount: number;
  likeCount: number;
  commentCount: number;
  onOpenWallet?: (() => void) | undefined;
}) {
  const v = (n: number) => (p.loading ? "…" : formatViews(n));
  const total = p.bonusBalance + p.walletBalance;
  const interactions = p.likeCount + p.commentCount;
  const engagement = p.totalViews > 0 ? (interactions / p.totalViews) * 100 : 0;
  const nextPct = Math.round(((p.reelViews % 1000) / 1000) * 100);
  return (
    <div className="px-5 space-y-5">
      <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-emerald-700 text-sm font-semibold">
        <BadgeCheck size={18} /> Monetization active · Professional mode
      </div>

      {/* Earnings */}
      <section className="rounded-3xl p-5 bg-gradient-to-br from-sky-500 via-cyan-500 to-emerald-500 text-white shadow-lg shadow-sky-100">
        <div className="flex items-center gap-2 text-xs opacity-90">
          <Wallet size={14} /> Total earnings
        </div>
        <p className="text-4xl font-bold mt-1 tracking-tight">
          ৳{p.loading ? "…" : total.toLocaleString()}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <p className="opacity-80">Reels bonus</p>
            <p className="text-base font-bold">৳{p.loading ? "…" : p.bonusBalance.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <p className="opacity-80">Wallet balance</p>
            <p className="text-base font-bold">৳{p.walletBalance.toLocaleString()}</p>
          </div>
        </div>
        <button
          onClick={p.onOpenWallet}
          className="mt-4 w-full h-11 rounded-2xl bg-white text-sky-600 font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          <Wallet size={16} /> Withdraw
        </button>
      </section>

      {/* Reels bonus */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-gray-900">Reels Performance Bonus</h2>
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-semibold text-gray-900">
              <Film size={15} className="text-sky-500" /> {v(p.reelViews)} reel views
            </span>
            <span className="text-xs text-gray-400">৳{BONUS_PER_1000_VIEWS} / 1K views</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
              style={{ width: `${nextPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400">
            {v(1000 - (p.reelViews % 1000))} more views to earn next ৳{BONUS_PER_1000_VIEWS}
          </p>
        </div>
      </section>

      {/* Insights */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <TrendingUp size={16} className="text-sky-500" /> Insights
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Stat icon={<Eye size={13} />} label="Reach / Views" value={v(p.totalViews)} />
          <Stat icon={<Users size={13} />} label="Followers" value={p.followers.toLocaleString()} />
          <Stat icon={<Heart size={13} />} label="Likes" value={v(p.likeCount)} />
          <Stat icon={<MessageCircle size={13} />} label="Comments" value={v(p.commentCount)} />
          <Stat icon={<FileText size={13} />} label="Posts" value={p.loading ? "…" : p.postCount.toLocaleString()} />
          <Stat icon={<Film size={13} />} label="Reels" value={p.loading ? "…" : p.reelCount.toLocaleString()} />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-gray-400">Engagement rate</p>
            <p className="text-lg font-bold text-gray-900">{p.loading ? "…" : `${engagement.toFixed(1)}%`}</p>
          </div>
          <p className="text-xs text-gray-400 text-right">
            {interactions.toLocaleString()} interactions
            <br />
            on {v(p.totalViews)} views
          </p>
        </div>
      </section>
    </div>
  );
}
