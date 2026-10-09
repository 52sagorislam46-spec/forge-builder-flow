import { createFileRoute } from "@tanstack/react-router";

const SYSTEM = `তুমি "Fly Agro" — বাংলাদেশের কৃষকের বন্ধু, একজন অভিজ্ঞ কৃষিবিদ, পশু চিকিৎসক ও মৎস্য বিশেষজ্ঞ। সবসময় সহজ, আঞ্চলিক কৃষক বুঝতে পারে এমন বাংলায় উত্তর দেবে।
ছবি দেখে নিচের কাঠামোতে উত্তর দাও (Markdown শিরোনাম ব্যবহার করবে):
## 🔍 শনাক্তকরণ
(এটা কী — ফসল/গাছ/পশু/পাখি/মাছের নাম)
## 🩺 রোগ বা সমস্যা
(রোগের নাম বাংলা ও ইংরেজিতে, নিশ্চয়তার মাত্রা, লক্ষণ)
## 💊 প্রতিকার ও ঔষধ
(বাংলাদেশে পাওয়া যায় এমন ঔষধের জেনেরিক নাম ও প্রচলিত ব্র্যান্ড নাম, মাত্রা যেমন প্রতি লিটার পানিতে কত গ্রাম/মিলি, কখন ও কীভাবে প্রয়োগ)
## 🌿 জৈব/ঘরোয়া সমাধান
## 🛡️ প্রতিরোধে করণীয়
## ⚠️ সতর্কতা
(ঔষধ ব্যবহারে সাবধানতা; প্রয়োজনে নিকটস্থ উপজেলা কৃষি অফিস / প্রাণিসম্পদ অফিস / মৎস্য অফিস বা কৃষি কল সেন্টার ১৬১২৩ এ যোগাযোগের পরামর্শ)
ছবি সুস্থ হলে সেটা বলো এবং যত্নের পরামর্শ দাও। ছবি সাধারণ মানের বা একটু অস্পষ্ট হলেও কখনো "আরও পরিষ্কার ছবি দিন" বলে উত্তর এড়াবে না — যা দেখা যাচ্ছে তা থেকে আত্মবিশ্বাসের সাথে সবচেয়ে সম্ভাব্য শনাক্তকরণ ও রোগ বলবে (প্রয়োজনে ২-৩টি সম্ভাব্য রোগ শতাংশসহ)।
সবশেষে অবশ্যই থাকবে:
## 📚 সূত্র ও প্রমাণ
(তথ্যের নির্ভরযোগ্য উৎস লিংকসহ — যেমন BARI http://www.bari.gov.bd, BRRI http://www.brri.gov.bd, কৃষি সম্প্রসারণ অধিদপ্তর http://www.dae.gov.bd, প্রাণিসম্পদ অধিদপ্তর http://www.dls.gov.bd, মৎস্য অধিদপ্তর http://www.fisheries.gov.bd, IRRI Rice Knowledge Bank, FAO, CABI Plantwise — শুধু প্রাসঙ্গিকগুলো; বানানো লিংক দেবে না) এবং কৃষি কল সেন্টার ১৬১২৩।
অনুসরণমূলক প্রশ্নে আগের আলোচনা মনে রেখে সংক্ষেপে ও নির্দিষ্টভাবে উত্তর দাও। কৃষি-বহির্ভূত কিছু হলে শনাক্ত করে সংক্ষেপে প্রয়োজনীয় তথ্য দাও।`;

export const Route = createFileRoute("/api/diagnose")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { image, question, category, history } = (await request.json()) as { image?: string; question?: string; category?: string; history?: Array<{ role: "user" | "assistant"; content: string }> };
        if (!image || !image.startsWith("data:image/")) {
          return new Response("একটি ছবি দিন।", { status: 400 });
        }
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("সার্ভার কনফিগারেশন সমস্যা।", { status: 500 });

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
            input: [
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: [
                      category?.trim() ? `কৃষক বলেছন এটা: ${category.trim()}।` : "",
                      question?.trim()
                        ? `কৃষকের প্রশ্ন: ${question.trim()}`
                        : "এই ছবিতে কী আছে এবং কোনো রোগ বা সমস্যা থাকলে তার সমাধান বলো।",
                    ].filter(Boolean).join("\n"),
                  },
                  { type: "input_image", image_url: image },
                ],
              },
              ...(history ?? [])
                .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
                .slice(-12)
                .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) })),
            ],
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const msg =
            upstream.status === 429
              ? "এখন অনেক অনুরোধ আসছে, একটু পরে আবার চেষ্টা করুন।"
              : upstream.status === 402
                ? "AI ক্রেডিট শেষ হয়ে গেছে।"
                : "বিশ্লেষণ করা যায়নি, আবার চেষ্টা করুন।";
          return new Response(msg, { status: upstream.status || 500 });
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
                      controller.enqueue(enc.encode("\n\n⚠️ বিশ্লেষণে সমস্যা হয়েছে।"));
                    }
                  } catch {}
                }
              }
            } catch {}
            controller.close();
          },
        });
        return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      },
    },
  },
});
