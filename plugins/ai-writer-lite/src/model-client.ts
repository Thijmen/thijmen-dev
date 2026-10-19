/**
 * One chat completion through Cloudflare's REST API, the only host this
 * plugin may reach (`allowedHosts`). The same endpoint serves Workers AI
 * models (`@cf/…`) and third-party models through AI Gateway unified
 * billing, all with one Cloudflare API token.
 *
 * A sandboxed request is stopped after 30 seconds of wall time, and the
 * plugin can't catch that. So the gateway gets its own, shorter deadline
 * (`cf-aig-request-timeout`): a slow model then fails with a readable error
 * instead of the request dying mid-flight.
 */
import type { PluginContext } from "emdash/plugin";

import type { Config } from "./config";
import type { ChatMessage } from "./types";

export const API_HOST = "api.cloudflare.com";
/** Leaves a few seconds of the sandbox's 30 for reading the schema and saving. */
export const MODEL_TIMEOUT_MS = 24_000;

export type Usage = { input: number; output: number };
export type Completion = { text: string; usage: Usage | null; ms: number };

export class ModelError extends Error {}

export async function complete(
	ctx: PluginContext,
	config: Pick<Config, "accountId" | "apiToken" | "gateway">,
	model: string,
	messages: ChatMessage[],
	maxTokens: number,
): Promise<Completion> {
	if (!ctx.http) throw new ModelError("The plugin has no network access (network:request was not granted).");
	const started = Date.now();
	let res: Response;
	try {
		res = await ctx.http.fetch(`https://${API_HOST}/client/v4/accounts/${encodeURIComponent(config.accountId)}/ai/v1/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.apiToken}`,
				"Content-Type": "application/json",
				// Required for Workers AI models; routes third-party ones through the same gateway (logs, spend limits).
				"cf-aig-gateway-id": config.gateway,
				"cf-aig-request-timeout": String(MODEL_TIMEOUT_MS),
				"cf-aig-metadata": JSON.stringify({ app: "ai-writer-lite" }),
			},
			body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
		});
	} catch (error) {
		throw new ModelError(`Couldn't reach ${API_HOST}: ${error instanceof Error ? error.message : String(error)}`);
	}
	const ms = Date.now() - started;
	const raw = await res.text();
	let body: unknown = null;
	try {
		body = raw ? JSON.parse(raw) : null;
	} catch {
		// Non-JSON error pages fall through to describeError.
	}
	if (!res.ok) throw new ModelError(describeError(res.status, body, raw, model));
	const text = stripReasoning(extractText(body));
	if (!text) throw new ModelError(`${model} returned an empty answer${finishReason(body) === "length" ? " (it ran out of output tokens)" : ""}.`);
	return { text, usage: extractUsage(body), ms };
}

/** OpenAI chat-completions shape; some Workers AI models still answer with `result.response`. */
function extractText(body: unknown): string {
	const b = body as Record<string, any> | null;
	const content = b?.choices?.[0]?.message?.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.map((part: any) => (typeof part === "string" ? part : (part?.text ?? ""))).join("");
	if (typeof b?.result?.response === "string") return b.result.response;
	if (typeof b?.response === "string") return b.response;
	return "";
}

function finishReason(body: unknown): string | undefined {
	return (body as Record<string, any> | null)?.choices?.[0]?.finish_reason;
}

function extractUsage(body: unknown): Usage | null {
	const u = (body as Record<string, any> | null)?.usage ?? (body as Record<string, any> | null)?.result?.usage;
	if (!u) return null;
	const input = u.prompt_tokens ?? u.input_tokens;
	const output = u.completion_tokens ?? u.output_tokens;
	return typeof input === "number" && typeof output === "number" ? { input, output } : null;
}

/** Reasoning models sometimes inline their thinking; only the answer after it counts. */
function stripReasoning(text: string): string {
	return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/** A readable reason for a failed call, shown in the admin. */
export function describeError(status: number, body: unknown, raw: string, model: string): string {
	const detail = providerDetail(body) ?? (raw.trim().slice(0, 300) || null);
	const codes = ((body as { errors?: Array<{ code?: number }> } | null)?.errors ?? []).map((e) => e.code);
	const text = `${detail ?? ""}`;
	if (status === 401 || status === 403 || codes.includes(10000)) {
		return `Cloudflare refused the API token (${status}). It needs the Account → Workers AI → Read permission for this account.${detail ? ` ${detail}` : ""}`;
	}
	if (status === 402 || /credit|insufficient|balance|payment required/i.test(text)) {
		return `No AI Gateway credits for ${model}. Add credits under AI → AI Gateway → Credits, or pick a Workers AI (@cf/…) model in settings.`;
	}
	if (status === 404 || /not found|no such model|unknown model/i.test(text)) {
		return `"${model}" isn't available for this account${detail ? ` (${detail})` : ""}. Check the id on developers.cloudflare.com/ai/models.`;
	}
	if (status === 408 || status === 504 || status === 524 || /timed? ?out|timeout/i.test(text)) {
		return `${model} didn't answer within ${MODEL_TIMEOUT_MS / 1000} seconds, the most a plugin request can wait. Pick a faster model, lower max output tokens, or write one field at a time from the editor panel.`;
	}
	if (status === 429) return `Rate limited on ${model}. Wait a moment and retry, or pick another model.`;
	return `${model}: ${status}${detail ? ` ${detail}` : ""}`;
}

/** The message out of a Cloudflare, OpenAI or Anthropic error envelope. */
function providerDetail(body: unknown): string | null {
	if (!body || typeof body !== "object") return null;
	const d = body as { error?: { message?: string } | string; errors?: Array<{ message?: string }>; message?: string };
	const text =
		(typeof d.error === "object" ? d.error?.message : d.error) ??
		(d.errors?.length ? d.errors.map((e) => e.message).filter(Boolean).join("; ") : undefined) ??
		d.message;
	return text ? String(text).slice(0, 300) : null;
}
