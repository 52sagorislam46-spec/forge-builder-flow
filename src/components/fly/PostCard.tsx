import { useEffect, useRef, useState } from "react";
import { Eye,
  Check,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db, secureUrl } from "../../lib/firebase";
import { timeAgo } from "../../lib/time";
import { Avatar } from "./Avatar";
import { formatViews, registerView } from "./views";
import { useAuth } from "./AuthContext";
import type { Comment, Post } from "./types";
import { ShareSheet } from "./ShareSheet";
import { StarGiftButton } from "./StarGift";
import { getPostBackground } from "./postBackgrounds";
import { AutoPlayVideo } from "./AutoPlayVideo";
import { ImageLightbox } from "./ImageLightbox";
import { Crown } from "lucide-react";
import { isVipOf, LockedPost, VipBadge } from "./vip";
import { isAdminVip, UserBadges } from "./badges";
import { Megaphone, Rocket } from "lucide-react";
import { BOOST_DAYS, boostPrice, isSponsored, requestBoost } from "./boost";
import { AddMoneyCard } from "./AddMoneyCard";
import { LikedBy, ReactionsSheet } from "./ReactionsSheet";

export function CommentItem({
  comment,
  postRef,
  comments,
  onOpenProfile,
  creatorId,
}: {
  comment: Comment;
  postRef: ReturnType<typeof doc>;
  comments: Comment[];
  onOpenProfile: (uid: string) => void;
  creatorId?: string;
}) {
  const { user, profile } = useAuth();
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const likes = comment.likes ?? [];
  const replies = comment.replies ?? [];
  const liked = !!user && likes.includes(user.uid);

  const saveComments = (next: Comment[]) =>
    updateDoc(postRef, { comments: next });

  const toggleLike = async () => {
    if (!user) return;
    const next = comments.map((c) => {
      if (c.id !== comment.id) return c;
      const cLikes = c.likes ?? [];
      return {
        ...c,
        likes: liked
          ? cLikes.filter((id) => id !== user.uid)
          : [...cLikes, user.uid],
      };
    });
    await saveComments(next);
  };

  const startReply = (id: string, name: string) => {
    setReplyTo({ id, name });
    setReplyText(`@${name} `);
    setReplyOpen(true);
    setTimeout(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  };

  const addReply = async () => {
    if (!user || !profile || !replyText.trim()) return;
    const target = replyTo ?? { id: comment.authorId, name: comment.authorName };
    let body = replyText.trim();
    const prefix = `@${target.name}`;
    const mentioned = body.startsWith(prefix);
    if (mentioned) body = body.slice(prefix.length).trim();
    if (!body) return;
    setBusy(true);
    const reply: Comment = {
      id: `${Date.now()}-${user.uid}`,
      authorId: user.uid,
      authorName: profile.displayName,
      authorPhoto: profile.photoURL,
      text: body,
      createdAt: Date.now(),
      likes: [],
      replies: [],
      ...(mentioned ? { replyToId: target.id, replyToName: target.name } : {}),
      ...(creatorId && isVipOf(profile, creatorId) ? { vip: true } : {}),
    };
    try {
      const next = comments.map((c) =>
        c.id === comment.id
          ? { ...c, replies: [...(c.replies ?? []), reply] }
          : c,
      );
      await saveComments(next);
      setReplyText("");
      setReplyTo(null);
      setReplyOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <button onClick={() => onOpenProfile(comment.authorId)} className="shrink-0">
          <Avatar uid={comment.authorId} src={comment.authorPhoto} alt={comment.authorName} size={32} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="inline-block max-w-full bg-gray-100 rounded-2xl px-3 py-2">
            <button
              onClick={() => onOpenProfile(comment.authorId)}
              className="text-[13px] font-semibold text-gray-900 text-left"
            >
              {comment.authorName}
              <UserBadges uid={comment.authorId} />
              {comment.vip && <VipBadge />}
            </button>
            <p className="text-[14px] leading-snug text-gray-800 break-words whitespace-pre-wrap">{comment.text}</p>
          </div>
          <div className="flex items-center gap-4 mt-1 px-2 text-xs text-gray-500">
            <span>{timeAgo(comment.createdAt)}</span>
            <button
              onClick={toggleLike}
              className={`flex items-center gap-1 font-semibold ${
                liked ? "text-rose-500" : "hover:text-gray-700"
              }`}
            >
              <Heart
                size={12}
                className={liked ? "fill-rose-500 text-rose-500" : ""}
              />
              {likes.length > 0 ? likes.length : "Like"}
            </button>
            <button
              onClick={() => startReply(comment.authorId, comment.authorName)}
              className="font-semibold hover:text-gray-700"
            >
              Reply
            </button>
          </div>

          {(replies.length > 0 || replyOpen) && (
            <div className="relative mt-2 space-y-3">
              {replies
                .slice()
                .sort((a, b) => a.createdAt - b.createdAt)
                .map((r) => (
                  <div key={r.id} className="relative flex items-start gap-2 pl-1">
                    {/* thread connector */}
                    <span
                      aria-hidden
                      className="absolute -left-[26px] -top-3 w-[22px] h-[22px] border-l-2 border-b-2 border-gray-200 rounded-bl-xl"
                    />
                    <button onClick={() => onOpenProfile(r.authorId)} className="shrink-0">
                      <Avatar uid={r.authorId} src={r.authorPhoto} alt={r.authorName} size={24} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="inline-block max-w-full bg-gray-100 rounded-2xl px-3 py-1.5">
                        <button
                          onClick={() => onOpenProfile(r.authorId)}
                          className="text-[12px] font-semibold text-gray-900 text-left"
                        >
                          {r.authorName}
                          <UserBadges uid={r.authorId} />
                          {r.vip && <VipBadge />}
                        </button>
                        <p className="text-[14px] leading-snug text-gray-800 break-words whitespace-pre-wrap">
                          {r.replyToName && (
                            <button
                              onClick={() => r.replyToId && onOpenProfile(r.replyToId)}
                              className="font-bold text-sky-600 mr-1"
                            >
                              {r.replyToName}
                            </button>
                          )}
                          {r.text}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 mt-0.5 px-2 text-[11px] text-gray-500">
                        <span>{timeAgo(r.createdAt)}</span>
                        <button
                          onClick={() => startReply(r.authorId, r.authorName)}
                          className="font-semibold hover:text-gray-700"
                        >
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

              {replyOpen && (
                <div className="relative flex items-center gap-2 pl-1">
                  <span
                    aria-hidden
                    className="absolute -left-[26px] -top-3 w-[22px] h-[30px] border-l-2 border-b-2 border-gray-200 rounded-bl-xl"
                  />
                  <input
                    ref={inputRef}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void addReply()}
                    placeholder={`Reply to ${replyTo?.name ?? comment.authorName}...`}
                    className="flex-1 min-w-0 h-9 px-3 rounded-2xl bg-gray-50 border border-gray-100 text-sm text-sky-700 outline-none focus:border-sky-300"
                  />
                  <button
                    onClick={addReply}
                    disabled={busy || !replyText.trim()}
                    className="h-9 px-3 rounded-2xl bg-sky-500 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    Reply
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PostCard({
  post,
  onOpenProfile,
  onOpenReels,
}: {
  post: Post;
  onOpenProfile: (uid: string) => void;
  onOpenReels?: (postId: string) => void;
}) {
  const { user, profile } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.text);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [boostDays, setBoostDays] = useState(1);
  const [boostBusy, setBoostBusy] = useState(false);
  const [boostLow, setBoostLow] = useState(false);
  const menuRef = useRef<HTMLSpanElement>(null);

  const hiddenPostsKey = user ? `fly-hidden-posts-${user.uid}` : null;

  useEffect(() => {
    if (!hiddenPostsKey) return;
    try {
      const stored = window.localStorage.getItem(hiddenPostsKey);
      const hiddenPostIds: unknown = stored ? JSON.parse(stored) : [];
      setHidden(Array.isArray(hiddenPostIds) && hiddenPostIds.includes(post.id));
    } catch {
      setHidden(false);
    }
  }, [hiddenPostsKey, post.id]);

  const hidePost = () => {
    setMenuOpen(false);
    setHidden(true);
    if (!hiddenPostsKey) return;
    try {
      const stored = window.localStorage.getItem(hiddenPostsKey);
      const parsed: unknown = stored ? JSON.parse(stored) : [];
      const hiddenPostIds = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
      if (!hiddenPostIds.includes(post.id)) hiddenPostIds.push(post.id);
      window.localStorage.setItem(hiddenPostsKey, JSON.stringify(hiddenPostIds));
    } catch {
      /* The post remains hidden for this session if device storage is unavailable. */
    }
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const liked = !!user && post.likes.includes(user.uid);
  const album = (post.media ?? []).filter((m) => m && m.url);
  const isAlbum = album.length > 1;
  const [albumLightbox, setAlbumLightbox] = useState<string | null>(null);
  const isVideo = !isAlbum && post.mediaType === "video" && !!secureUrl(post.mediaUrl);
  const ref = doc(db, "posts", post.id);
  const locked =
    !!post.exclusive && user?.uid !== post.authorId && !isVipOf(profile, post.authorId) && !isAdminVip(profile);


  const toggleLike = async () => {
    if (!user) return;
    await updateDoc(ref, {
      likes: liked ? arrayRemove(user.uid) : arrayUnion(user.uid),
    });
  };

  const saveEdit = async () => {
    if (!editText.trim() && !post.mediaUrl) return;
    setSavingEdit(true);
    try {
      await updateDoc(ref, { text: editText.trim() });
      setEditing(false);
    } finally {
      setSavingEdit(false);
    }
  };

  const addComment = async () => {
    if (!user || !profile || !commentText.trim()) return;
    setBusy(true);
    const comment: Comment = {
      id: `${Date.now()}-${user.uid}`,
      authorId: user.uid,
      authorName: profile.displayName,
      authorPhoto: profile.photoURL,
      text: commentText.trim(),
      createdAt: Date.now(),
      likes: [],
      replies: [],
      ...(isVipOf(profile, post.authorId) ? { vip: true } : {}),
    };
    try {
      await updateDoc(ref, { comments: arrayUnion(comment) });
      setCommentText("");
    } finally {
      setBusy(false);
    }
  };

  const share = () => setShowShare(true);


  const media = secureUrl(post.mediaUrl);

  if (hidden) return null;


  return (
    <article className="bg-white border-b border-gray-100 px-4 py-4">
      <div className="flex items-start gap-3">
        <button onClick={() => onOpenProfile(post.authorId)}>
          <Avatar uid={post.authorId} src={post.authorPhoto} alt={post.authorName} size={40} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-sm">
            <button
              onClick={() => onOpenProfile(post.authorId)}
              className="font-semibold text-gray-900 text-left break-words min-w-0"
            >
              {post.authorName}
            </button>
            <UserBadges uid={post.authorId} />
            <span className="text-gray-300">·</span>
            <span className="text-gray-400 shrink-0">{timeAgo(post.createdAt)}</span>
            <span className="ml-auto flex items-center gap-1 shrink-0" ref={menuRef}>
              <span className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
                  aria-label="Post options"
                >
                  <MoreHorizontal size={20} />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-9 z-30 w-44 rounded-xl bg-white shadow-xl border border-gray-100 py-1">
                    {user?.uid === post.authorId ? (
                      <>
                        <button
                          onClick={() => {
                            setEditText(post.text);
                            setEditing(true);
                            setMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <Pencil size={16} /> Edit post
                        </button>
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            setBoostOpen(true);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-sky-600 hover:bg-gray-50"
                        >
                          <Rocket size={16} /> Boost post
                        </button>
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            deleteDoc(ref);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-gray-50"
                        >
                          <Trash2 size={16} /> Delete post
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={hidePost}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <X size={16} /> Hide post
                      </button>
                    )}
                  </div>
                )}
              </span>
              <button
                onClick={hidePost}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
                aria-label="Hide post"
              >
                <X size={19} />
              </button>
            </span>

          </div>
          {isSponsored(post) && (
            <span className="inline-flex items-center gap-1 mt-1 mr-2 px-2 py-0.5 rounded-full bg-sky-50 text-[11px] font-semibold text-sky-600">
              <Megaphone size={12} /> Sponsored
            </span>
          )}
          {boostOpen && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setBoostOpen(false)}>
              <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  <Rocket size={20} className="text-sky-500" />
                  <h3 className="text-lg font-bold text-gray-900">Boost Post</h3>
                </div>
                {post.boostStatus === "pending" ? (
                  <p className="text-sm text-gray-600">আপনার বুস্ট আবেদন রিভিউতে আছে। অনুমোদন হলে পোস্টটি হোম ফিডে "Sponsored" হিসেবে দেখাবে।</p>
                ) : isSponsored(post) ? (
                  <p className="text-sm text-gray-600">এই পোস্টটি এখন Sponsored — {new Date(post.boostUntil ?? 0).toLocaleDateString()} পর্যন্ত চলবে।</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">কত দিনের জন্য বুস্ট করতে চান? টাকা ওয়ালেট থেকে কাটা হবে। বাতিল হলে টাকা ফেরত পাবেন।</p>
                    {post.boostStatus === "rejected" && <p className="text-xs text-red-500">আগের আবেদন গ্রহণ করা হয়নি — আবার আবেদন করতে পারেন।</p>}
                    <div className="grid grid-cols-4 gap-2">
                      {BOOST_DAYS.map((d) => (
                        <button key={d} onClick={() => { setBoostDays(d); setBoostLow(false); }} className={`h-14 rounded-xl text-sm font-semibold flex flex-col items-center justify-center ${boostDays === d ? "bg-sky-500 text-white" : "bg-gray-100 text-gray-700"}`}>
                          <span>{d} দিন</span>
                          <span className="text-[11px] opacity-80">৳{boostPrice(d)}</span>
                        </button>
                      ))}
                    </div>
                    {boostLow && (
                      <>
                        <p className="text-xs text-red-500">ওয়ালেটে পর্যাপ্ত টাকা নেই — রিচার্জ করুন।</p>
                        <AddMoneyCard />
                      </>
                    )}
                    <button
                      disabled={boostBusy}
                      onClick={async () => {
                        if (!user) return;
                        setBoostBusy(true);
                        try {
                          const r = await requestBoost(post.id, boostDays, user.uid);
                          if (r === "insufficient") setBoostLow(true);
                          else setBoostOpen(false);
                        } finally { setBoostBusy(false); }
                      }}
                      className="w-full h-11 rounded-xl bg-sky-500 text-white text-sm font-semibold disabled:opacity-50"
                    >
                      {boostBusy ? "…" : `Pay ৳${boostPrice(boostDays)} & Boost`}
                    </button>
                  </>
                )}
                <button onClick={() => setBoostOpen(false)} className="w-full h-10 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold">Close</button>
              </div>
            </div>
          )}
          {post.exclusive && (
            <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-amber-600">
              <Crown size={12} /> VIP exclusive
            </span>
          )}

          {locked ? (
            <LockedPost onOpen={() => onOpenProfile(post.authorId)} />
          ) : (
          <>
          {editing ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-2xl bg-gray-50 border border-gray-100 text-[15px] text-gray-800 outline-none focus:border-sky-300 resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="h-8 px-4 rounded-full bg-sky-500 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                >
                  <Check size={13} /> Save
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="h-8 px-4 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold flex items-center gap-1"
                >
                  <X size={13} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            post.text &&
            !isVideo &&
            (post.bgStyle && !post.mediaUrl ? (
              (() => {
                const bg = getPostBackground(post.bgStyle);
                const len = post.text.length;
                const size =
                  len < 60 ? "text-3xl" : len < 120 ? "text-2xl" : len < 220 ? "text-xl" : "text-lg";
                return (
                  <div
                    className="mt-3 -ml-[4.25rem] -mr-4 min-h-[280px] aspect-[4/3] max-h-[420px] flex items-center justify-center px-8 py-10"
                    style={{ background: bg.background }}
                  >
                    <p
                      className={`${size} font-bold leading-snug text-center whitespace-pre-wrap break-words drop-shadow-sm`}
                      style={{ color: bg.textColor }}
                    >
                      {post.text}
                    </p>
                  </div>
                );
              })()
            ) : (
              <p
                className={`text-gray-900 mt-1.5 mb-1 whitespace-pre-wrap break-words ${
                  !post.mediaUrl && !isAlbum && post.text.length < 85
                    ? "text-[22px] leading-snug"
                    : "text-[15px] leading-[1.55]"
                }`}
              >
                {post.text}
              </p>
            ))
          )}

          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {post.tags.map((t) => (
                <span
                  key={t}
                  className="text-[11px] font-medium text-sky-600 bg-sky-50 rounded-full px-2 py-0.5"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}

          {post.taggedUsers && post.taggedUsers.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              — সাথে{" "}
              {post.taggedUsers.map((t, i) => (
                <span key={t.uid}>
                  <button onClick={() => onOpenProfile(t.uid)} className="font-semibold text-gray-800">
                    {t.name}
                  </button>
                  {i < post.taggedUsers!.length - 1 ? ", " : ""}
                </span>
              ))}
            </p>
          )}

          {isAlbum && (
            <AlbumGrid
              items={album}
              onImage={(u) => setAlbumLightbox(u)}
              onVideoPlay={() => registerView(post.id)}
            />
          )}

          {media && !isAlbum && (
            <div className="mt-3 -ml-[4.25rem] -mr-4 overflow-hidden">
              {post.mediaType === "video" ? (
                <AutoPlayVideo
                  src={media}
                  onFirstPlay={() => registerView(post.id)}
                  onVideoClick={() => onOpenReels?.(post.id)}
                  className="w-full h-auto max-h-[75vh] object-cover block"
                />
              ) : (
                <img
                  src={media}
                  alt="post media"
                  onClick={() => setLightbox(true)}
                  className="w-full h-auto max-h-[75vh] object-cover cursor-zoom-in block"
                />
              )}
            </div>
          )}
          </>
          )}
          {isVideo ? (
            <div className="mt-2.5 -ml-[3.25rem]">
              <div className="flex items-center gap-5 text-gray-800">
                <span className="flex items-center gap-1.5">
                  <button
                    onClick={toggleLike}
                    className="active:scale-90 transition-transform"
                    aria-label="Like"
                  >
                    <Heart
                      size={24}
                      className={liked ? "text-rose-500 fill-rose-500" : ""}
                    />
                  </button>
                  {post.likes.length > 0 && (
                    <button
                      onClick={() => setShowReactions(true)}
                      className="text-sm font-semibold hover:underline"
                    >
                      {formatViews(post.likes.length)}
                    </button>
                  )}
                </span>
                <button
                  onClick={() => setShowComments((v) => !v)}
                  className="flex items-center gap-1.5 active:scale-90 transition-transform"
                  aria-label="Comments"
                >
                  <MessageCircle size={23} />
                  <span className="text-sm font-semibold">
                    {formatViews(post.comments.length) || ""}
                  </span>
                </button>
                <button
                  onClick={share}
                  className="flex items-center gap-1.5 active:scale-90 transition-transform"
                  aria-label="Share"
                >
                  <Send size={22} />
                </button>
                <span className="ml-auto flex items-center gap-1.5 text-gray-400">
                  <Eye size={19} />
                  <span className="text-xs font-medium">
                    {formatViews(post.views ?? 0)}
                  </span>
                </span>
              </div>
              <LikedBy userIds={post.likes} onOpen={() => setShowReactions(true)} />
              {post.text && (
                <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap break-words">
                  <button
                    onClick={() => onOpenProfile(post.authorId)}
                    className="font-semibold mr-1.5"
                  >
                    {post.authorUsername}
                  </button>
                  <span className={captionExpanded ? "" : "line-clamp-1 inline"}>
                    {post.text}
                  </span>
                  {!captionExpanded && post.text.length > 60 && (
                    <button
                      onClick={() => setCaptionExpanded(true)}
                      className="text-gray-400 ml-1"
                    >
                      more
                    </button>
                  )}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-400">{timeAgo(post.createdAt)}</p>
            </div>
          ) : (
          <div className="flex items-center gap-6 mt-3 text-gray-400 -ml-[3.25rem]">
            <span className="flex items-center gap-1.5 text-sm">
              <button
                onClick={toggleLike}
                aria-label="Like"
                className="active:scale-90 transition-transform"
              >
                <Heart
                  size={19}
                  className={liked ? "text-rose-500 fill-rose-500" : ""}
                />
              </button>
              {post.likes.length > 0 && (
                <button
                  onClick={() => setShowReactions(true)}
                  className={`hover:underline ${liked ? "text-rose-500" : ""}`}
                >
                  {post.likes.length}
                </button>
              )}
            </span>
            <button
              onClick={() => setShowComments((v) => !v)}
              className="flex items-center gap-1.5 text-sm active:scale-90 transition-transform"
            >
              <MessageCircle size={19} />
              <span>{post.comments.length || ""}</span>
            </button>
            <button
              onClick={share}
              className="flex items-center gap-1.5 text-sm active:scale-90 transition-transform"
            >
              <Send size={18} />
            </button>
            <StarGiftButton creatorId={post.authorId} creatorName={post.authorName} postId={post.id} />

            {post.mediaType === "video" && (
              <span className="flex items-center gap-1.5 text-sm ml-auto">
                <Eye size={18} />
                <span>{formatViews(post.views ?? 0)} views</span>
              </span>
            )}
          </div>
          )}

          {showComments && (
            <div className="mt-3 space-y-3">
              {post.comments
                .slice()
                .sort((a, b) => a.createdAt - b.createdAt)
                .map((c) => (
                  <CommentItem
                    key={c.id}
                    comment={c}
                    postRef={ref}
                    comments={post.comments}
                    onOpenProfile={onOpenProfile}
                    creatorId={post.authorId}
                  />
                ))}
              <div className="flex items-center gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 h-10 px-3 rounded-2xl bg-gray-50 border border-gray-100 text-sm outline-none focus:border-sky-300"
                />
                <button
                  onClick={addComment}
                  disabled={busy || !commentText.trim()}
                  className="h-10 px-4 rounded-2xl bg-sky-500 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Post
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showReactions && (
        <ReactionsSheet
          userIds={post.likes}
          onClose={() => setShowReactions(false)}
          onOpenProfile={onOpenProfile}
        />
      )}
      {showShare && (
        <ShareSheet
          mediaUrl={media || ""}
          mediaType={post.mediaType}
          text={post.text}
          postId={post.id}
          onClose={() => setShowShare(false)}
        />
      )}
      {albumLightbox && (
        <ImageLightbox src={albumLightbox} onClose={() => setAlbumLightbox(null)} />
      )}
      {lightbox && media && !isVideo && (
        <ImageLightbox src={media} onClose={() => setLightbox(false)} />
      )}
    </article>
  );
}

function AlbumGrid({
  items,
  onImage,
  onVideoPlay,
}: {
  items: { url: string; type: string }[];
  onImage: (url: string) => void;
  onVideoPlay: () => void;
}) {
  const shown = items.slice(0, items.length > 4 ? 4 : items.length);
  const extra = items.length - shown.length;
  const n = shown.length;
  const cell = (m: { url: string; type: string }, i: number, cls: string) => {
    const url = secureUrl(m.url) || m.url;
    const last = i === n - 1 && extra > 0;
    return (
      <div key={i} className={`relative overflow-hidden bg-gray-100 ${cls}`}>
        {m.type === "video" ? (
          <AutoPlayVideo src={url} onFirstPlay={onVideoPlay} className="w-full h-full object-cover block" />
        ) : (
          <img src={url} alt="post media" onClick={() => onImage(url)} className="w-full h-full object-cover cursor-zoom-in block" />
        )}
        {last && (
          <div onClick={() => onImage(url)} className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-3xl font-bold cursor-pointer">
            +{extra}
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="mt-3 -ml-[4.25rem] -mr-4 overflow-hidden">
      {n === 2 && <div className="grid grid-cols-2 gap-1 h-72">{shown.map((m, i) => cell(m, i, "h-full"))}</div>}
      {n === 3 && (
        <div className="grid grid-cols-3 grid-rows-2 gap-1 h-96">
          {cell(shown[0]!, 0, "col-span-2 row-span-2")}
          {cell(shown[1]!, 1, "")}
          {cell(shown[2]!, 2, "")}
        </div>
      )}
      {n === 4 && <div className="grid grid-cols-2 grid-rows-2 gap-1 h-96">{shown.map((m, i) => cell(m, i, ""))}</div>}
    </div>
  );
}
