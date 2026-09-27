import { APICallError, type SystemModelMessage } from "ai";
import { createWorkersAI, WorkersAIGatewayError } from "workers-ai-provider";
import { anthropic } from "workers-ai-provider/anthropic";
import { openai } from "workers-ai-provider/openai";

import { isAnthropic, isCatalogSlug } from "../models";

/**
 * The language model for one writer turn, through the one `env.AI` binding.
 * `@cf/…` ids run on Workers AI; `provider/model` ids go through AI Gateway's
 * unified-billing path (the account's "default" gateway), parsed with the
 * provider's wire format: `anthropic` natively, the rest (OpenAI, Google,
 * xAI, Groq, DeepSeek, Qwen, MiniMax) as OpenAI chat-completions.
 */
export function writerModel(ai: Ai, modelId: string, session: string) {
	const workersai = createWorkersAI({ binding: ai, providers: [openai, anthropic] });
	// Model ids come from settings, so the id-typed overloads can't narrow them.
	const build = workersai as unknown as (id: string, settings?: Record<string, unknown>) => ReturnType<typeof workersai>;
	if (!isCatalogSlug(modelId)) return build(modelId);
	return build(modelId, {
		// Gateway resume is still rolling out upstream; ai-chat already resumes the stream to the page.
		resume: false,
		// Spend per writing session in the AI Gateway dashboard.
		metadata: { app: "ai-writer", session },
	});
}

/**
 * The system prompt, with a prompt-cache breakpoint for Anthropic so each
 * step of the tool loop reuses the cached system prompt and tools instead of
 * paying for them again. A block-level breakpoint, not the newer top-level
 * automatic `cache_control`, which is the prime suspect for the 400s from AI
 * Gateway's unified-billing path. OpenAI and Gemini cache on their own.
 */
export function systemFor(modelId: string, text: string): string | SystemModelMessage {
	if (!isAnthropic(modelId)) return text;
	return { role: "system", content: text, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } };
}

/** A readable reason for a failed model call, shown in the writer with a Retry. */
export function describeModelError(error: unknown, modelId: string): string {
	const message = error instanceof Error ? error.message : String(error);
	const gateway = find(error, (e): e is WorkersAIGatewayError => e instanceof WorkersAIGatewayError);
	const call = find(error, (e): e is APICallError => APICallError.isInstance(e));
	const status = gateway?.status ?? call?.statusCode ?? null;
	// The provider's own explanation; "Bad Request" alone says nothing.
	const detail = providerDetail(call?.responseBody) ?? providerDetail(gateway?.raw);

	if (/credit|insufficient|balance|payment required/i.test(`${message} ${detail ?? ""}`) || status === 402) {
		return `No unified billing credits for ${modelId}. Add credits under AI Gateway → Credits in the Cloudflare dashboard, then retry.`;
	}
	if (gateway?.code === "not-found" || status === 404) {
		return `"${modelId}" isn't available through AI Gateway${detail ? ` (${detail})` : ""}. Check the id on developers.cloudflare.com/ai/models or pick another model.`;
	}
	if (gateway?.code === "auth" || status === 401 || status === 403) {
		return `AI Gateway refused the request for ${modelId}${detail ? `: ${detail}` : " (auth)"}. Check that unified billing is enabled for the account's default gateway.`;
	}
	if (gateway?.code === "rate-limit" || status === 429) return `Rate limited on ${modelId}. Wait a moment and retry, or switch models.`;
	if (/run remotely/i.test(message)) return message;
	return `${modelId}: ${status ? `${status} ` : ""}${detail ?? message}`;
}

function find<T>(error: unknown, match: (e: unknown) => e is T): T | null {
	for (let e: unknown = error, depth = 0; e && depth < 5; e = (e as { cause?: unknown }).cause, depth++) {
		if (match(e)) return e;
	}
	return null;
}

/** Pull the message out of an Anthropic, OpenAI or Cloudflare error envelope. */
function providerDetail(raw: unknown): string | null {
	if (raw == null) return null;
	let data: unknown = raw;
	if (typeof raw === "string") {
		try {
			data = JSON.parse(raw);
		} catch {
			return raw.trim().slice(0, 400) || null;
		}
	}
	const d = data as { error?: { message?: string } | string; errors?: Array<{ message?: string }>; message?: string };
	const text =
		(typeof d.error === "object" ? d.error?.message : d.error) ?? d.errors?.map((e) => e.message).filter(Boolean).join("; ") ?? d.message;
	return text ? String(text).slice(0, 400) : JSON.stringify(data).slice(0, 400);
}
