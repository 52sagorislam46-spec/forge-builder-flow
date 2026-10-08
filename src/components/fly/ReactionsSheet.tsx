import { useEffect, useState } from "react";
import { Heart, X } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Avatar } from "./Avatar";
import { UserBadges } from "./badges";

type Person = { uid: string; name: string; username: string; photo: string };

export function ReactionsSheet({
  userIds,
  onClose,
  onOpenProfile,
}: {
  userIds: string[];
  onClose: () => void;
  onOpenProfile: (uid: string) => void;
}) {
  const [people, setPeople] = useState<Person[] | null>(null);

  useEffect(() => {
    let alive = true;
    const ids = Array.from(new Set(userIds)).slice(0, 200);
    void Promise.all(
      ids.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, "users", uid));
          const x = (snap.data() ?? {}) as Record<string, unknown>;
          return {
            uid,
            name: String(x["displayName"] ?? "User"),
            username: String(x["username"] ?? ""),
            photo: String(x["photoURL"] ?? ""),
          };
        } catch {
          return { uid, name: "User", username: "", photo: "" };
        }
      }),
    ).then((list) => alive && setPeople(list));
    return () => {
      alive = false;
    };
  }, [userIds]);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl max-h-[75vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
            <span className="w-6 h-6 rounded-full bg-rose-500 flex items-center justify-center">
              <Heart size={13} className="text-white fill-white" />
            </span>
            {userIds.length} {userIds.length === 1 ? "reaction" : "reactions"}
          </h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400">
            <X size={22} />
          </button>
        </div>
        <div className="overflow-y-auto px-2 py-2">
          {people === null && <p className="text-sm text-gray-400 text-center py-6">Loading…</p>}
          {people?.map((p) => (
            <button
              key={p.uid}
              onClick={() => {
                onClose();
                onOpenProfile(p.uid);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-gray-50 text-left"
            >
              <span className="relative shrink-0">
                <Avatar src={p.photo} alt={p.name} size={44} />
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 border-2 border-white flex items-center justify-center">
                  <Heart size={7} className="text-white fill-white" />
                </span>
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1 text-sm font-semibold text-gray-900 break-words">
                  {p.name}
                  <UserBadges uid={p.uid} />
                </span>
                {p.username && <span className="block text-xs text-gray-400">@{p.username}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Facebook/Instagram style "Liked by X and N others" line. Tap to see everyone. */
export function LikedBy({ userIds, onOpen }: { userIds: string[]; onOpen: () => void }) {
  const [first, setFirst] = useState<Person | null>(null);
  const firstId = userIds[userIds.length - 1];
  useEffect(() => {
    if (!firstId) return;
    let alive = true;
    getDoc(doc(db, "users", firstId))
      .then((snap) => {
        const x = (snap.data() ?? {}) as Record<string, unknown>;
        if (alive)
          setFirst({
            uid: firstId,
            name: String(x["displayName"] ?? "User"),
            username: String(x["username"] ?? ""),
            photo: String(x["photoURL"] ?? ""),
          });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [firstId]);
  if (!userIds.length) return null;
  const others = userIds.length - 1;
  return (
    <button onClick={onOpen} className="mt-2 flex items-center gap-2 text-sm text-gray-700 text-left">
      <span className="flex -space-x-2">
        {userIds.slice(-3).reverse().map((id) => (
          <Avatar key={id} uid={id} alt="" size={20} className="ring-2 ring-white" />
        ))}
      </span>
      <span>
        Liked by <span className="font-semibold">{first?.name ?? "…"}</span>
        {others > 0 && (
          <>
            {" "}and <span className="font-semibold">{others.toLocaleString()} {others === 1 ? "other" : "others"}</span>
          </>
        )}
      </span>
    </button>
  );
}
