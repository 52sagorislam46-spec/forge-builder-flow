/**
 * Opens mic (+camera) for calls with step-by-step fallbacks so it works in
 * old phones and the Android app (WebView), where strict constraints or the
 * permissions API often fail even though the mic itself is allowed.
 */
export async function openCallMedia(
  type: "audio" | "video",
  video: MediaTrackConstraints,
): Promise<MediaStream> {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!md?.getUserMedia) throw Object.assign(new Error("no media"), { name: "NotSupportedError" });
  const audio: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  const attempts: MediaStreamConstraints[] =
    type === "video"
      ? [
          { audio, video },
          { audio: true, video: { facingMode: "user" } },
          { audio: true, video: true },
          { audio: true }, // camera broken → still talk
        ]
      : [{ audio }, { audio: true }];
  let last: unknown;
  for (const c of attempts) {
    try {
      return await md.getUserMedia(c);
    } catch (e) {
      last = e;
      const n = (e as { name?: string })?.name;
      if (n === "NotAllowedError" && c.video === undefined) break;
    }
  }
  throw last;
}
