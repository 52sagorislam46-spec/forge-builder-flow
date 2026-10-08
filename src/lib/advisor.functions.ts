import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getBuildSuggestions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ description: z.string().min(10).max(8000) }).parse(d),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false as const, error: "AI is not configured." };
    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    const openai = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });
    try {
      const result = streamText({
        model: openai.responses("openai/gpt-6-astra"),
        system:
          "You are a senior engineer and product advisor. Given a description of a build or project, give concrete, actionable improvement suggestions grouped under short markdown headings (e.g. Features, UX, Performance, Security, Code quality). Use bullet points, be specific, keep it under 400 words. Reply in the same language the user wrote in.",
        prompt: data.description,
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      });
      const text = await result.text;
      return { ok: true as const, text };
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status;
      const msg =
        status === 429
          ? "Too many requests, please try again shortly."
          : status === 402
            ? "AI credits are exhausted."
            : e?.message || "Failed to generate suggestions.";
      return { ok: false as const, error: msg };
    }
  });
