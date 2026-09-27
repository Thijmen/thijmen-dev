/**
 * The writer's recommended models (tested for tool calling), shown first in
 * the picker; the picker also lists Cloudflare's whole text-generation
 * catalog (`catalog.ts`). All run through the one `env.AI` binding:
 * - Workers AI (`@cf/…`), billed as Workers AI usage.
 * - Third-party catalog models (`<provider>/<model>`), routed by
 *   workers-ai-provider through AI Gateway's unified-billing path, so they
 *   land on the Cloudflare invoice too. Ids as listed on
 *   developers.cloudflare.com/ai/models (Sep 2026).
 * The writer needs a model that supports tool calling.
 */
export type ModelOption = { value: string; label: string; group: string; description?: string };

export const MODELS: readonly ModelOption[] = [
	{ value: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", group: "Anthropic" },
	{ value: "anthropic/claude-opus-5", label: "Claude Opus 5", group: "Anthropic" },
	{ value: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", group: "Anthropic" },
	{ value: "openai/gpt-5.5", label: "GPT-5.5", group: "OpenAI" },
	{ value: "openai/gpt-5.4-mini", label: "GPT-5.4 mini", group: "OpenAI" },
	{ value: "google/gemini-3.1-pro", label: "Gemini 3.1 Pro", group: "Google" },
	{ value: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", group: "Google" },
	{ value: "xai/grok-4.5", label: "Grok 4.5", group: "xAI" },
	{ value: "@cf/moonshotai/kimi-k2.6", label: "Kimi K2.6", group: "Workers AI" },
	{ value: "@cf/deepseek-ai/deepseek-v4-pro-0813", label: "DeepSeek V4 Pro", group: "Workers AI" },
	{ value: "@cf/zai-org/glm-5.3", label: "GLM-5.3", group: "Workers AI" },
	{ value: "@cf/openai/gpt-oss-120b", label: "gpt-oss-120b", group: "Workers AI" },
	{ value: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B (fast)", group: "Workers AI" },
];

export const DEFAULT_MODEL = "anthropic/claude-sonnet-5";
export const DEFAULT_MAX_TOKENS = 16000;

/** `@cf/…` (Workers AI) or `provider/model` (unified catalog); no spaces, sane length. */
const MODEL_ID = /^(@cf\/[\w.-]+\/[\w.:-]+|[a-z][\w-]*\/[\w.:-]+)$/i;

export function isValidModelId(id: string): boolean {
	return id.length <= 120 && MODEL_ID.test(id);
}

/** A third-party catalog slug, routed through AI Gateway (unified billing). */
export function isCatalogSlug(id: string): boolean {
	return !id.startsWith("@cf/") && id.includes("/");
}

export function isAnthropic(id: string): boolean {
	return id.startsWith("anthropic/");
}

/** The curated label, or the raw id for a custom model. */
export function labelFor(id: string): string {
	return MODELS.find((m) => m.value === id)?.label ?? id;
}
