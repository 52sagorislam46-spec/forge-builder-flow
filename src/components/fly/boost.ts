import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, runTransaction, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { Post } from "./types";

export const BOOST_DAYS = [1, 7, 15, 30];
export const BOOST_PRICES: Record<number, number> = { 1: 50, 7: 300, 15: 600, 30: 1000 };
export const boostPrice = (days: number) => BOOST_PRICES[days] ?? 0;

export function isSponsored(p: Post, now = Date.now()): boolean {
  return p.boostStatus === "approved" && (p.boostUntil ?? 0) > now;
}

/** Charges the boost price from the author's wallet and submits for review. */
export async function requestBoost(postId: string, days: number, userId: string): Promise<"ok" | "insufficient"> {
  const price = boostPrice(days);
  const uRef = doc(db, "users", userId);
  const pRef = doc(db, "posts", postId);
  return runTransaction(db, async (tx) => {
    const bal = Number(((await tx.get(uRef)).data() as { walletBalance?: number } | undefined)?.walletBalance ?? 0);
    if (bal < price) return "insufficient" as const;
    tx.update(uRef, { walletBalance: bal - price });
    tx.update(pRef, { boostStatus: "pending", boostDays: days, boostPaid: price, boostRequestedAt: Date.now() });
    return "ok" as const;
  });
}

/** Approve sets sponsorship; reject refunds the paid amount to the author's wallet. */
export async function reviewBoost(post: Post, approve: boolean) {
  const pRef = doc(db, "posts", post.id);
  const uRef = doc(db, "users", post.authorId);
  await runTransaction(db, async (tx) => {
    const p = (await tx.get(pRef)).data() as (Post & { boostPaid?: number }) | undefined;
    const u = (await tx.get(uRef)).data() as { walletBalance?: number } | undefined;
    if (approve) {
      tx.update(pRef, { boostStatus: "approved", boostUntil: Date.now() + (p?.boostDays ?? 1) * 86400000 });
    } else {
      const paid = Number(p?.boostPaid ?? 0);
      tx.update(pRef, { boostStatus: "rejected", boostPaid: 0 });
      if (paid > 0) tx.update(uRef, { walletBalance: Number(u?.walletBalance ?? 0) + paid });
    }
  });
}

/** Live list of posts with a given boost status. */
export function useBoostPosts(status: "approved" | "pending") {
  const [posts, setPosts] = useState<Post[] | null>(null);
  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "posts"), where("boostStatus", "==", status)),
        (s) => setPosts(s.docs.map((d) => ({ ...(d.data() as Post), id: d.id }))),
        () => setPosts([]),
      ),
    [status],
  );
  return posts;
}

/** Puts active sponsored posts first, then every 5th slot, without duplicates. */
export function mixSponsored(feed: Post[], sponsored: Post[]): Post[] {
  const active = sponsored.filter((p) => isSponsored(p));
  if (active.length === 0) return feed;
  const ids = new Set(active.map((p) => p.id));
  const rest = feed.filter((p) => !ids.has(p.id));
  const out: Post[] = [active[0]!];
  let s = 1;
  rest.forEach((p, i) => {
    out.push(p);
    if ((i + 1) % 5 === 0 && s < active.length) out.push(active[s++]!);
  });
  while (s < active.length) out.push(active[s++]!);
  return out;
}
