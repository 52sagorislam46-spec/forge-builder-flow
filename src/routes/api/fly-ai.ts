import { createFileRoute } from "@tanstack/react-router";

const SYSTEM = `You are "Fly AI", the friendly built-in assistant of the Fly social media & chat app.
- Answer ANY question helpfully and accurately, like a modern assistant (general knowledge, study, coding, health basics, writing, translation, advice, maths, etc.).
- Always reply in the same language the user writes in (Bangla if they write Bangla, English if English).
- Use short paragraphs, bullet points and Markdown when helpful. Be warm and clear.
- Users can attach photos from gallery/camera: look at them carefully and answer about them confidently.
- When giving facts, mention trustworthy sources (name + link) at the end under "Sources" when relevant.
- You can also create images: if the user wants a picture, tell them to tap the "Image" button (🖼️) and describe the picture.
- Fly app owner / admin is **Sagor Islam** (Email: 52sagorislam46@gmail.com). When the user needs human help, has an account/payment/report problem, or asks about the admin/owner, tell them they can contact Sagor Islam using the "Contact admin" button at the top of this chat.`;

type Msg = { role: "user" | "assistant"; content: string; image?: string };

const fail = (status: number) =>
  status === 429
    ? "Too many requests right now — please try again in a moment."
    : status === 402
      ? "Fly AI credits have run out. Please tell the admin."
      : "Fly AI could not answer, please try again.";

export const Route = createFileRoute("/api/fly-ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
          messages?: Msg[];
          mode?: "chat" | "image";
          prompt?: string;
          image?: string;
        } | null;
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Server is not configured.", { status: 500 });

        /* ---------- image generation / editing ---------- */
        if (body?.mode === "image") {
          const prompt = (body.prompt ?? "").trim().slice(0, 1500);
          if (!prompt) return Response.json({ error: "Describe the picture first." }, { status: 400 });
          const src =
            typeof body.image === "string" && body.image.startsWith("data:image/") ? body.image : null;
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": key,
              "X-Lovable-AIG-SDK": "fetch",
            },
            signal: request.signal,
            body: JSON.stringify({
              model: "google/gemini-3.1-flash-image",
              modalities: ["image", "text"],
              messages: [
                {
                  role: "user",
                  content: src
                    ? [
                        { type: "text", text: `Edit this photo as asked, keep everything else the same: ${prompt}` },
                        { type: "image_url", image_url: { url: src } },
                      ]
                    : prompt,
                },
              ],
            }),
          });
          if (!res.ok) {
            console.error("fly-ai image failed", res.status, await res.text());
            return Response.json({ error: fail(res.status) }, { status: res.status });
          }
          const data = (await res.json()) as {
            choices?: Array<{
              message?: { content?: string; images?: Array<{ image_url?: { url?: string } }> };
            }>;
          };
          const msg = data.choices?.[0]?.message;
          const image = msg?.images?.[0]?.image_url?.url;
          if (!image) {
            return Response.json(
              { error: "Could not create that picture. Try describing it differently." },
              { status: 422 },
            );
          }
          return Response.json({ image, text: msg?.content ?? "" });
        }

        /* ---------- chat (streamed) ---------- */
        const history = (body?.messages ?? [])
          .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-20)
          .map((m, i, arr) => {
            const text = m.content.slice(0, 6000);
            const withImage =
              m.role === "user" &&
              typeof m.image === "string" &&
              m.image.startsWith("data:image/") &&
              i >= arr.length - 6;
            if (m.role === "assistant") return { role: m.role, content: text };
            return {
              role: m.role,
              content: [
                { type: "input_text", text: text || "এই ছবিটি বিশ্লেষণ করো।" },
                ...(withImage ? [{ type: "input_image", image_url: m.image }] : []),
              ],
            };
          });
        if (!history.length || history[history.length - 1]?.role !== "user") {
          return new Response("Write a question first.", { status: 400 });
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "fetch",
          },
          signal: request.signal,
          body: JSON.stringify({
            model: "openai/gpt-6-astra",
            stream: true,
            store: false,
            reasoning: { effort: "medium" },
            instructions: SYSTEM,
            input: history,
          }),
        });
        if (!upstream.ok || !upstream.body) {
          console.error("fly-ai chat failed", upstream.status);
          return new Response(fail(upstream.status), { status: upstream.status || 500 });
        }

        const reader = upstream.body.getReader();
        const dec = new TextDecoder();
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            let buf = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                  if (!line.startsWith("data:")) continue;
                  const data = line.slice(5).trim();
                  if (!data || data === "[DONE]") continue;
                  try {
                    const ev = JSON.parse(data);
                    if (ev.type === "response.output_text.delta" && ev.delta) {
                      controller.enqueue(enc.encode(ev.delta));
                    } else if (ev.type === "response.failed" || ev.type === "error") {
                      controller.enqueue(enc.encode("\n\n⚠️ Something went wrong."));
                    }
                  } catch {
                    /* partial line */
                  }
                }
              }
            } catch {
              /* client stopped */
            }
            controller.close();
          },
        });
        return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      },
    },
  },
});
