import { env } from "cloudflare:workers";

// Workers AI call. Kept out of models.ts: the descriptor imports that at
// config time, where `cloudflare:workers` doesn't exist.

export type ChatMessage = { role: "system" | "user"; content: string };

export type Generation = {
	text: string;
	usage: { input: number; output: number } | null;
};

export async function generate(model: string, messages: ChatMessage[], maxTokens: number): Promise<Generation> {
	const ai = (env as { AI?: Ai }).AI;
	if (!ai) throw new Error("No Workers AI binding: add `ai.binding = \"AI\"` to wrangler.jsonc");
	// Model ids are a settings value, not a literal the typed overloads can narrow on.
	const run = ai.run.bind(ai) as (model: string, input: unknown) => Promise<unknown>;
	const result = await run(model, { messages, max_tokens: maxTokens });
	return { text: stripReasoning(extractText(result)), usage: extractUsage(result) };
}

function extractText(result: unknown): string {
	if (typeof result === "string") return result;
	const r = result as Record<string, any>;
	if (typeof r?.response === "string") return r.response;
	const content = r?.choices?.[0]?.message?.content;
	if (typeof content === "string") return content;
	// Responses-API shape (gpt-oss): output[] items with output_text parts.
	if (Array.isArray(r?.output)) {
		return r.output
			.filter((item: any) => item?.type === "message")
			.flatMap((item: any) => item.content ?? [])
			.filter((part: any) => part?.type === "output_text")
			.map((part: any) => part.text)
			.join("");
	}
	throw new Error("Workers AI returned no text");
}

function extractUsage(result: unknown): Generation["usage"] {
	const u = (result as Record<string, any>)?.usage;
	if (!u) return null;
	const input = u.prompt_tokens ?? u.input_tokens;
	const output = u.completion_tokens ?? u.output_tokens;
	return typeof input === "number" && typeof output === "number" ? { input, output } : null;
}

/** Reasoning models sometimes inline their thinking; only the answer after it is output. */
function stripReasoning(text: string): string {
	return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
