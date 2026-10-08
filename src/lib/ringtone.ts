/**
 * Generates real ringtone audio (WAV data URIs) at runtime so calls have a
 * proper looping ringtone / ringback without shipping any asset files.
 */

function encodeWav(samples: Float32Array, sampleRate: number): string {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += bytesPerSample;
  }
  // Base64 encode without blowing the call stack on large buffers.
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const b64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(binary, "binary").toString("base64");
  return `data:audio/wav;base64,${b64}`;
}

const SAMPLE_RATE = 22050;

/** Classic dual-tone (440 Hz + 480 Hz) ring cadence, safe to loop. */
function buildRing(
  segments: Array<{ on: boolean; seconds: number }>,
  gain: number,
): string {
  const total = segments.reduce((sum, s) => sum + s.seconds, 0);
  const samples = new Float32Array(Math.round(total * SAMPLE_RATE));
  let index = 0;
  for (const seg of segments) {
    const count = Math.round(seg.seconds * SAMPLE_RATE);
    for (let i = 0; i < count; i++, index++) {
      if (!seg.on) {
        samples[index] = 0;
        continue;
      }
      const t = i / SAMPLE_RATE;
      // Short fades keep the loop click-free.
      const fade = Math.min(1, t / 0.01, (seg.seconds - t) / 0.01);
      const value =
        Math.sin(2 * Math.PI * 440 * t) * 0.5 +
        Math.sin(2 * Math.PI * 480 * t) * 0.5;
      samples[index] = value * gain * Math.max(0, fade);
    }
  }
  return encodeWav(samples, SAMPLE_RATE);
}

let ringtoneUri: string | null = null;
let ringbackUri: string | null = null;

/** Sweet marimba-like melody used for every incoming call (loops seamlessly). */
function buildMelody(gain: number): string {
  // C6 E6 G6 E6 · C6 E6 G6 C7 — bright, clear and pleasant.
  const notes = [1046.5, 1318.5, 1568, 1318.5, 1046.5, 1318.5, 1568, 2093];
  const step = 0.18;
  const tail = 1.3;
  const total = notes.length * step + tail;
  const samples = new Float32Array(Math.round(total * SAMPLE_RATE));
  notes.forEach((freq, n) => {
    const start = Math.round(n * step * SAMPLE_RATE);
    const len = Math.round(0.6 * SAMPLE_RATE);
    for (let i = 0; i < len && start + i < samples.length; i++) {
      const t = i / SAMPLE_RATE;
      const env = Math.min(1, t / 0.005) * Math.exp(-t * 6);
      const v =
        Math.sin(2 * Math.PI * freq * t) * 0.7 +
        Math.sin(2 * Math.PI * freq * 2 * t) * 0.2 * Math.exp(-t * 12) +
        Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.15;
      samples[start + i] = (samples[start + i] ?? 0) + v * env * gain;
    }
  });
  return encodeWav(samples, SAMPLE_RATE);
}

/** Incoming-call ringtone (shared by inbox and group calls). */
export function ringtoneDataUri(): string {
  if (!ringtoneUri) ringtoneUri = buildMelody(0.55);
  return ringtoneUri;
}

/** Outgoing-call ringback the caller hears while the other side rings. */
export function ringbackDataUri(): string {
  if (!ringbackUri) {
    ringbackUri = buildRing(
      [
        { on: true, seconds: 1 },
        { on: false, seconds: 2.5 },
      ],
      0.28,
    );
  }
  return ringbackUri;
}
