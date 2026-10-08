import { useEffect, useState } from "react";
import { BadgeCheck, Crown } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";

/** Public status flags set by admins on a user's profile document. */
export interface UserStatus {
  vipApproved: boolean;
  monetized: boolean;
}

const EMPTY: UserStatus = { vipApproved: false, monetized: false };
const cache = new Map<string, UserStatus>();
const listeners = new Map<string, Set<(s: UserStatus) => void>>();
const unsubs = new Map<string, () => void>();

/** True when an admin approved this profile as a platform VIP. */
export function isAdminVip(profile: unknown): boolean {
  return (profile as { vipApproved?: boolean } | null)?.vipApproved === true;
}

/** Live, shared (one listener per user) subscription to a user's badge flags. */
export function useUserStatus(uid: string | undefined): UserStatus {
  const [s, setS] = useState<UserStatus>(() => (uid && cache.get(uid)) || EMPTY);
  useEffect(() => {
    if (!uid) return;
    setS(cache.get(uid) ?? EMPTY);
    let set = listeners.get(uid);
    if (!set) {
      set = new Set();
      listeners.set(uid, set);
      const unsub = onSnapshot(
        doc(db, "users", uid),
        (snap) => {
          const d = snap.data() ?? {};
          const next = {
            vipApproved: d["vipApproved"] === true,
            monetized: d["monetizationStatus"] === "approved",
          };
          cache.set(uid, next);
          listeners.get(uid)?.forEach((fn) => fn(next));
        },
        () => {},
      );
      unsubs.set(uid, unsub);
    }
    set.add(setS);
    return () => {
      const l = listeners.get(uid);
      l?.delete(setS);
      if (l && l.size === 0) {
        listeners.delete(uid);
        unsubs.get(uid)?.();
        unsubs.delete(uid);
      }
    };
  }, [uid]);
  return s;
}

/** Golden crown "VIP" badge for admin-approved VIP users. */
export function AdminVipBadge() {
  return (
    <span
      title="VIP"
      className="inline-flex items-center gap-0.5 ml-1 align-middle rounded-full bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 px-1.5 py-[1px] text-[9px] font-extrabold text-white shadow-sm ring-1 ring-amber-200"
    >
      👑 VIP
    </span>
  );
}

/** Green verified mark for approved monetized creators. */
export function MonetizedBadge({ label = false }: { label?: boolean }) {
  return (
    <span
      title="Monetized Creator"
      className="inline-flex items-center gap-0.5 ml-1 align-middle text-emerald-500"
    >
      <BadgeCheck size={label ? 16 : 14} className="fill-emerald-500 text-white" />
      {label && <span className="text-[10px] font-bold text-emerald-600">Monetized Creator</span>}
    </span>
  );
}

/** Renders every public badge a user has earned, next to their name. */
export function UserBadges({ uid, label = false }: { uid: string | undefined; label?: boolean }) {
  const s = useUserStatus(uid);
  if (!s.vipApproved && !s.monetized) return null;
  return (
    <>
      {s.monetized && <MonetizedBadge label={label} />}
      {s.vipApproved && <AdminVipBadge />}
    </>
  );
}

// keep Crown import tree-shakable for future use
export { Crown };
