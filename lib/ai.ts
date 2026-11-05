import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Opus je přesnější, Haiku asi 40× levnější. Volí se v Nastavení, výchozí je AI_MODEL nebo opus.
export type ModelChoice = "opus" | "haiku";
const MODELS: Record<ModelChoice, { id: string; input: number; output: number }> = {
  opus: { id: "claude-opus-5-5", input: 4, output: 20 }, // $ za milion tokenů
  haiku: { id: "claude-haiku-5-5", input: 0.1, output: 0.5 },
};
export const pickModel = (m?: string): ModelChoice =>
  m === "haiku" || m === "opus" ? m : process.env.AI_MODEL === "haiku" ? "haiku" : "opus";

export type AiResult<T> = { data: T; cost: number };

/** Jeden dotaz se strukturovanou odpovědí (JSON podle schématu). Vrací i cenu v USD. */
export async function askJson<T>(opts: {
  model: ModelChoice;
  system: string;
  content: string;
  schema: object;
  effort?: "low" | "medium";
  maxTokens?: number;
}): Promise<AiResult<T>> {
  const m = MODELS[opts.model];
  const params = {
    model: m.id,
    max_tokens: opts.maxTokens ?? 16000,
    output_config: { effort: opts.effort ?? "low", format: { type: "json_schema", schema: opts.schema } },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  };
  // Opus při odmítnutí zkusí záložní model na straně serveru; Haiku tuhle volbu nemá
  const response: any =
    opts.model === "opus"
      ? await client.beta.messages.create({
          ...params,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        } as any)
      : await client.messages.create(params as any);

  if (response.stop_reason === "refusal") throw new Error("AI odmítla dotaz zpracovat");
  if (response.stop_reason === "max_tokens") throw new Error("AI odpověď se nevešla do limitu");
  const text = response.content.flatMap((b: any) => (b.type === "text" ? [b.text] : [])).join("");
  const u = response.usage ?? {};
  const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) * 0.1;
  const cost = (inputTokens * m.input + (u.output_tokens ?? 0) * m.output) / 1e6;
  return { data: JSON.parse(text) as T, cost };
}
