/**
 * Models offered in settings. Every one runs through the same Cloudflare REST
 * endpoint (`/ai/v1/chat/completions`): `@cf/…` ids on Workers AI, billed as
 * Workers AI usage; `provider/model` ids through AI Gateway unified billing,
 * paid from the account's AI Gateway credits.
 *
 * A whole entry has to come back inside the sandbox's 30-second limit, so the
 * list leans towards fast models. Ids as listed on
 * developers.cloudflare.com/ai/models (Oct 2026).
 */
export type ModelOption = { value: string; label: string };

export const CUSTOM = "custom";

export const MODELS: readonly ModelOption[] = [
	{ value: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B fast (Workers AI)" },
	{ value: "@cf/openai/gpt-oss-120b", label: "gpt-oss-120b (Workers AI)" },
	{ value: "@cf/zai-org/glm-5.3", label: "GLM-5.3 (Workers AI)" },
	{ value: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5 (AI Gateway credits)" },
	{ value: "openai/gpt-5.4-mini", label: "GPT-5.4 mini (AI Gateway credits)" },
	{ value: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash (AI Gateway credits)" },
	{ value: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5 (AI Gateway credits, slower)" },
];

/** Works on any account with Workers AI, no credits needed, and is quick. */
export const DEFAULT_MODEL = MODELS[0].value;

/** `@cf/…` (Workers AI) or `provider/model` (catalog); no spaces, sane length. */
const MODEL_ID = /^(@cf\/[\w.-]+\/[\w.:-]+|[a-z][\w-]*\/[\w.:-]+)$/i;

export function isValidModelId(id: string): boolean {
	return id.length <= 120 && MODEL_ID.test(id);
}

export function isWorkersAI(id: string): boolean {
	return id.startsWith("@cf/");
}

export function labelFor(id: string): string {
	return MODELS.find((m) => m.value === id)?.label ?? id;
}
