import type { PluginContext } from "emdash/plugin";

import { CUSTOM, DEFAULT_MODEL, isValidModelId } from "./models";

/** Default for the `styleGuide` setting: house rules that suit most sites. */
export const DEFAULT_STYLE_GUIDE = `Write like someone who knows the subject explaining it to a peer: specific, concrete and plain. Short declarative sentences. Real nouns, numbers and trade-offs over adjectives.

Never write filler ("In today's fast-paced world", "Let's dive in", "In conclusion"), marketing adjectives (seamless, robust, cutting-edge, game-changing), emoji or exclamation marks.

Titles in sentence case. Headings in a body state what the section says, not questions or puns. Prefer prose over bullet lists; use a list only for a real enumeration. Put code, commands and config in fenced code blocks with the language on the fence.`;

export const DEFAULT_MAX_TOKENS = 3000;
export const DEFAULT_GATEWAY = "default";

export type Config = {
	accountId: string;
	apiToken: string;
	gateway: string;
	/** The model to use: the custom id when chosen, else the selected one. */
	model: string;
	/** The settings select value (a model id or `custom`). */
	modelChoice: string;
	customModel: string;
	maxTokens: number;
	styleGuide: string;
	about: string;
	/** Field slugs (or `collection.field`) the writer leaves alone. */
	skipFields: string[];
};

/** Non-secret settings, stored together under one key. */
type StoredConfig = Partial<Record<"accountId" | "gateway" | "model" | "customModel" | "styleGuide" | "about" | "skipFields", string> & { maxTokens: number }>;

const CONFIG_KEY = "config";
/** Declared `secret` in the manifest's settingsSchema, so the host encrypts it. */
const TOKEN_KEY = "apiToken";

function str(v: unknown): string {
	return typeof v === "string" ? v.trim() : "";
}

/**
 * All settings in one bridge call: the sandbox allows 10 calls out per
 * request, and a writing request needs most of them.
 */
export async function readConfig(ctx: PluginContext): Promise<Config> {
	const stored = new Map((await ctx.settings.list()).map(({ key, value }) => [key, value]));
	const c = (stored.get(CONFIG_KEY) ?? {}) as StoredConfig;
	let apiToken = str(stored.get(TOKEN_KEY));
	// list() returns secrets decrypted; fall back to get() should it ever hand back an envelope.
	if (stored.has(TOKEN_KEY) && !apiToken) apiToken = str(await ctx.settings.get<string>(TOKEN_KEY));
	const modelChoice = str(c.model) || DEFAULT_MODEL;
	const customModel = str(c.customModel);
	const maxTokens = Number(c.maxTokens);
	return {
		accountId: str(c.accountId),
		apiToken,
		gateway: str(c.gateway) || DEFAULT_GATEWAY,
		model: modelChoice === CUSTOM ? (isValidModelId(customModel) ? customModel : "") : modelChoice,
		modelChoice,
		customModel,
		maxTokens: Number.isFinite(maxTokens) && maxTokens >= 256 ? Math.min(Math.round(maxTokens), 16000) : DEFAULT_MAX_TOKENS,
		styleGuide: str(c.styleGuide) || DEFAULT_STYLE_GUIDE,
		about: str(c.about),
		skipFields: parseList(str(c.skipFields)),
	};
}

export function parseList(value: string): string[] {
	return value
		.split(/[,\n]/)
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
}

/** What's missing before the writer can call a model, or null when it's ready. */
export function setupProblem(config: Config): string | null {
	if (!config.accountId) return "Add your Cloudflare account ID in AI writer settings.";
	if (!config.apiToken) return "Add a Cloudflare API token in AI writer settings.";
	if (!config.model) return "The custom model id in AI writer settings isn't a valid model id.";
	return null;
}

export type SettingsForm = {
	accountId?: unknown;
	apiToken?: unknown;
	gateway?: unknown;
	model?: unknown;
	customModel?: unknown;
	maxTokens?: unknown;
	styleGuide?: unknown;
	about?: unknown;
	skipFields?: unknown;
};

/** Validate and store the settings form. Returns an error message, or null when saved. */
export async function saveConfig(ctx: PluginContext, values: SettingsForm, modelValues: string[]): Promise<string | null> {
	const accountId = str(values.accountId);
	if (accountId && !/^[a-f0-9]{32}$/i.test(accountId)) return "The account ID is the 32-character hex id from the Cloudflare dashboard URL.";
	const gateway = str(values.gateway) || DEFAULT_GATEWAY;
	if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(gateway)) return "The gateway id may only contain letters, digits, - and _.";
	const model = str(values.model) || DEFAULT_MODEL;
	if (model !== CUSTOM && !modelValues.includes(model)) return "Pick a model from the list.";
	const customModel = str(values.customModel);
	if (model === CUSTOM && !isValidModelId(customModel)) return "Enter a model id like @cf/meta/llama-3.3-70b-instruct-fp8-fast or anthropic/claude-haiku-4.5.";
	const maxTokens = Number(values.maxTokens ?? DEFAULT_MAX_TOKENS);
	if (!Number.isFinite(maxTokens) || maxTokens < 256 || maxTokens > 16000) return "Max output tokens must be between 256 and 16000.";

	const config: StoredConfig = {
		accountId,
		gateway,
		model,
		customModel,
		maxTokens: Math.round(maxTokens),
		// Store the default as empty, so a later release's default reaches this site.
		styleGuide: str(values.styleGuide) === DEFAULT_STYLE_GUIDE.trim() ? "" : str(values.styleGuide),
		about: str(values.about),
		skipFields: str(values.skipFields),
	};
	// The masked field comes back empty unless it was edited: keep the stored token then.
	// The token goes first: if the host can't encrypt it, nothing is saved.
	const token = str(values.apiToken);
	if (token) {
		try {
			await ctx.settings.set(TOKEN_KEY, token);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (/EMDASH_ENCRYPTION_KEY/.test(message)) {
				return "This site can't store secrets yet: it needs an EMDASH_ENCRYPTION_KEY. Generate one with `npx emdash secrets generate`, set it as a secret on the site (e.g. `wrangler secret put EMDASH_ENCRYPTION_KEY`), redeploy, and save again.";
			}
			throw error;
		}
	}
	await ctx.settings.set(CONFIG_KEY, config);
	return null;
}
