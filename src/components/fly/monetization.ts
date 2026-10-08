import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  runTransaction,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { notifyAdminNotice } from "../../lib/appNotifications";

/** Taka needed to buy one star via Add Money. */
export const TAKA_PER_BOUGHT_STAR = 1;

export interface PaymentSettings {
  bkash?: string;
  nagad?: string;
}

export interface RechargeRequest {
  id: string;
  uid: string;
  displayName: string;
  username: string;
  kind: "wallet" | "stars";
  method: "bKash" | "Nagad";
  sender: string;
  trxId: string;
  amount: number;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  reviewedAt?: number;
}

const settingsRef = () => doc(db, "settings", "payment");

export function usePaymentSettings() {
  const [s, setS] = useState<PaymentSettings | null>(null);
  useEffect(
    () => onSnapshot(settingsRef(), (d) => setS((d.data() as PaymentSettings) ?? {}), () => setS({})),
    [],
  );
  return s;
}

export const savePaymentSettings = (s: PaymentSettings) =>
  setDoc(settingsRef(), { ...s, updatedAt: Date.now() }, { merge: true });

export async function submitRecharge(r: Omit<RechargeRequest, "id" | "status" | "createdAt">) {
  await addDoc(collection(db, "rechargeRequests"), { ...r, status: "pending", createdAt: Date.now() });
}

export async function reviewRecharge(r: RechargeRequest, approve: boolean) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "rechargeRequests", r.id);
    const snap = await tx.get(ref);
    if ((snap.data() as RechargeRequest | undefined)?.status !== "pending") throw new Error("done");
    tx.update(ref, { status: approve ? "approved" : "rejected", reviewedAt: Date.now() });
    if (approve) {
      tx.set(
        doc(db, "users", r.uid),
        r.kind === "stars"
          ? { stars: increment(Math.floor(r.amount / TAKA_PER_BOUGHT_STAR)) }
          : { walletBalance: increment(r.amount) },
        { merge: true },
      );
    }
  });
  await notifyAdminNotice({
    uid: r.uid,
    title: approve ? "Add Money approved" : "Add Money rejected",
    text: approve
      ? r.kind === "stars"
        ? `${Math.floor(r.amount / TAKA_PER_BOUGHT_STAR)} স্টার আপনার অ্যাকাউন্টে যোগ হয়েছে।`
        : `৳${r.amount} আপনার ওয়ালেটে যোগ হয়েছে।`
      : `আপনার রিচার্জ (TrxID ${r.trxId}) যাচাই করা যায়নি।`,
  }).catch(() => {});
}

/** Admin gift: free stars and/or wallet taka. Stars start at 100 for new accounts. */
export async function grantFree(uid: string, stars: number, taka: number) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "users", uid);
    const d = ((await tx.get(ref)).data() ?? {}) as { stars?: number; walletBalance?: number };
    const curStars = typeof d.stars === "number" ? d.stars : 100;
    tx.set(ref, { stars: curStars + stars, walletBalance: (d.walletBalance ?? 0) + taka }, { merge: true });
  });
  const parts = [stars ? `${stars} স্টার` : "", taka ? `৳${taka}` : ""].filter(Boolean).join(" ও ");
  await notifyAdminNotice({ uid, title: "Gift from Fly", text: `অ্যাডমিন আপনাকে ${parts} উপহার দিয়েছেন 🎁` }).catch(() => {});
}

export async function setMonetization(uid: string, status: "approved" | "rejected" | null) {
  await updateDoc(doc(db, "users", uid), { monetizationStatus: status });
  if (status)
    await notifyAdminNotice({
      uid,
      title: status === "approved" ? "Monetization approved" : "Monetization rejected",
      text: status === "approved" ? "অভিনন্দন! আপনার মনিটাইজেশন আবেদন অনুমোদিত হয়েছে 🎉" : "আপনার মনিটাইজেশন আবেদন গ্রহণ করা হয়নি।",
    }).catch(() => {});
}

export async function setVipApproved(uid: string, on: boolean) {
  await updateDoc(doc(db, "users", uid), { vipApproved: on });
  if (on)
    await notifyAdminNotice({ uid, title: "VIP approved", text: "👑 অভিনন্দন! আপনি এখন VIP — সব ক্রিয়েটরের এক্সক্লুসিভ পোস্ট ও রিলস ফ্রিতে দেখতে পারবেন।" }).catch(() => {});
}
