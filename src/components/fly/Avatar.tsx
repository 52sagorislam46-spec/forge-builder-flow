import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, secureUrl } from "../../lib/firebase";

// Live cache of each user's current profile photo (from their Fly profile,
// never the old Google/Gmail photo). One listener per user, shared by all avatars.
const photoCache = new Map<string, string>();
const listeners = new Map<string, Set<(url: string) => void>>();
const unsubs = new Map<string, () => void>();

function subscribePhoto(uid: string, cb: (url: string) => void) {
  let set = listeners.get(uid);
  if (!set) {
    set = new Set();
    listeners.set(uid, set);
  }
  set.add(cb);
  if (!unsubs.has(uid)) {
    const unsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        const url = String(snap.data()?.["photoURL"] ?? "");
        if (!url) return;
        photoCache.set(uid, url);
        listeners.get(uid)?.forEach((fn) => fn(url));
      },
      () => {},
    );
    unsubs.set(uid, unsub);
  }
  return () => {
    const s = listeners.get(uid);
    s?.delete(cb);
    if (s && s.size === 0) {
      listeners.delete(uid);
      unsubs.get(uid)?.();
      unsubs.delete(uid);
    }
  };
}

/** Returns the user's current profile photo, falling back to `fallback`. */
export function useLivePhoto(uid: string | undefined, fallback?: string) {
  const [url, setUrl] = useState<string | undefined>(() =>
    uid ? photoCache.get(uid) : undefined,
  );
  useEffect(() => {
    if (!uid) return;
    setUrl(photoCache.get(uid));
    return subscribePhoto(uid, setUrl);
  }, [uid]);
  return url || fallback;
}

export function Avatar({
  src,
  alt,
  size = 40,
  className = "",
  uid,
}: {
  src?: string;
  alt: string;
  size?: number;
  className?: string;
  /** When set, always shows this user's current profile photo. */
  uid?: string | undefined;
}) {
  const [failed, setFailed] = useState(false);
  const live = useLivePhoto(uid, src);
  const url = secureUrl(live);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) {
    return (
      <div
        aria-label={alt}
        style={{ width: size, height: size }}
        className={`rounded-full bg-gray-200 ring-1 ring-gray-200 shrink-0 ${className}`}
      />
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
      className={`rounded-full object-cover bg-gray-200 ring-1 ring-gray-200 shrink-0 ${className}`}
      loading="lazy"
    />
  );
}
