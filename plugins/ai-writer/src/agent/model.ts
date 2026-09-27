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
 * Per-provider request options. Anthropic: automatic prompt caching, so each
 * step of the tool loop reuses the cached system prompt, tools and history
 * instead of paying for them again. OpenAI and Gemini cache on their own.
 */
export function providerOptionsFor(modelId: string) {
	return isAnthropic(modelId) ? { anthropic: { cacheControl: { type: "ephemeral" as const } } } : undefined;
}

/** A readable reason for a failed model call, shown in the writer with a Retry. */
export function describeModelError(error: unknown, modelId: string): string {
	const message = error instanceof Error ? error.message : String(error);
	const gateway = findGatewayError(error);
	if (/credit|insufficient|balance|payment required/i.test(message) || gateway?.status === 402) {
		return `No unified billing credits for ${modelId}. Add credits under AI Gateway → Credits in the Cloudflare dashboard, then retry.`;
	}
	if (gateway) {
		switch (gateway.code) {
			case "not-found":
				return `"${modelId}" isn't available through AI Gateway. Check the id on developers.cloudflare.com/ai/models or pick another model.`;
			case "auth":
				return `AI Gateway refused the request for ${modelId} (auth). Check that unified billing is enabled for the account's default gateway.`;
			case "rate-limit":
				return `Rate limited on ${modelId}. Wait a moment and retry, or switch models.`;
			default:
				return `${modelId}: ${gateway.message}`;
		}
	}
	return /run remotely/i.test(message) ? message : `${modelId}: ${message}`;
}

function findGatewayError(error: unknown): WorkersAIGatewayError | null {
	for (let e: unknown = error, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
		if (e instanceof WorkersAIGatewayError) return e;
	}
	return null;
}
