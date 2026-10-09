import { createServerFn } from "@tanstack/react-start";

type Ice = { urls: string | string[]; username?: string; credential?: string };

/**
 * Returns TURN relay servers so calls connect on mobile data / strict NAT.
 * Supports a Metered.ca account (METERED_DOMAIN + METERED_API_KEY) or any
 * static TURN server (TURN_URLS comma separated + TURN_USERNAME + TURN_CREDENTIAL).
 */
export const getIceServers = createServerFn({ method: "GET" }).handler(async () => {
  const out: Ice[] = [];
  const domain = process.env["METERED_DOMAIN"];
  const key = process.env["METERED_API_KEY"];
  if (domain && key) {
    try {
      const res = await fetch(
        `https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(key)}`,
      );
      if (res.ok) {
        const list = (await res.json()) as Ice[];
        if (Array.isArray(list)) out.push(...list);
      } else {
        console.error("TURN credentials failed", res.status, await res.text());
      }
    } catch (e) {
      console.error("TURN credentials error", e);
    }
  }
  const urls = process.env["TURN_URLS"];
  if (urls) {
    out.push({
      urls: urls.split(",").map((u) => u.trim()).filter(Boolean),
      username: process.env["TURN_USERNAME"] ?? "",
      credential: process.env["TURN_CREDENTIAL"] ?? "",
    });
  }
  if (!out.length) {
    // Built-in Metered relay (fly.metered.live) so calls work on any network.
    const username = "b0a51fef98435887eb20a23a";
    const credential = "SkfJFOAbWhkEt5Ex";
    out.push(
      { urls: "stun:stun.relay.metered.ca:80" },
      { urls: "turn:global.relay.metered.ca:80", username, credential },
      { urls: "turn:global.relay.metered.ca:80?transport=tcp", username, credential },
      { urls: "turn:global.relay.metered.ca:443", username, credential },
      { urls: "turns:global.relay.metered.ca:443?transport=tcp", username, credential },
    );
  }
  return { iceServers: out };
});
