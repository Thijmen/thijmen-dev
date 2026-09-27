import { APICallError, type SystemModelMessage } from "ai";
import { createWorkersAI, WorkersAIGatewayError } from "workers-ai-provider";
import { anthropic } from "workers-ai-provider/anthropic";
import { openai } from "workers-ai-provider/openai";

import { isAnthropic, isCatalogSlug } from "../models";

/**
 * The language model for one writer turn, through the one `env.AI` binding.
 * `@cf/…` ids run on Workers AI; `provider/model` ids go through AI Gateway's
 * unified-billing path (the account's "default" gateway), parsed with the
 * provider's wire format: `anthropic` natively, the rest as OpenAI
 * chat-completions.
 */
export function writerModel(ai: Ai, modelId: string, session: string) {
	// Model ids come from settings, so the id-typed overloads can't narrow them.
	type Build = (id: string, settings?: Record<string, unknown>) => ReturnType<ReturnType<typeof createWorkersAI>>;
	const metadata = { app: "ai-writer", session };
	if (!isCatalogSlug(modelId)) return (createWorkersAI({ binding: ai }) as unknown as Build)(modelId);
	if (DELEGATE_PROVIDERS.has(modelId.split("/")[0])) {
		const build = createWorkersAI({ binding: ai, providers: [openai, anthropic] }) as unknown as Build;
		// Gateway resume is still rolling out upstream; ai-chat already resumes the stream to the page.
		return build(modelId, { resume: false, metadata });
	}
	// Catalog providers the SDK's registry doesn't know yet (e.g. moonshotai,
	// thinkingmachines): the bare unified-billing run path, OpenAI wire format.
	return (createWorkersAI({ binding: ai }) as unknown as Build)(modelId, { metadata });
}

/** Providers workers-ai-provider 4.0 routes on the unified-billing run path with its own parsers. */
const DELEGATE_PROVIDERS = new Set(["openai", "anthropic", "google", "xai", "groq", "alibaba", "minimax", "deepseek"]);

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
