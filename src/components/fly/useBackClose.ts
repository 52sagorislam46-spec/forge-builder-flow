import { useEffect, useRef } from "react";

let layerSeq = 0;

/**
 * While `open` is true, the browser/phone back button closes this layer
 * (menu, settings, wallet…) instead of jumping back to the home page.
 */
export function useBackClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const id = ++layerSeq;
    const base = (window.history.state ?? {}) as Record<string, unknown>;
    window.history.pushState({ ...base, flyLayer: id }, "");
    const onPop = (e: PopStateEvent) => {
      const layer = Number((e.state as { flyLayer?: number } | null)?.flyLayer ?? 0);
      if (layer < id) closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);
}
