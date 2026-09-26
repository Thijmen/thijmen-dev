import { env } from "cloudflare:workers";
import { definePlugin, type RouteContext } from "emdash";

import { signToken, writerSecret } from "./agent/token";
import { entrySpec, type Target } from "./entry-spec";
import { DEFAULT_MAX_TOKENS, DEFAULT_MODEL, MODELS } from "./models";
import { DEFAULT_STYLE_GUIDE } from "./prompt";

export const PLUGIN_ID = "ai-writer";
export const VERSION = "0.2.0";
const ADMIN_ENTRY = "@thijmen/plugin-ai-writer/admin";
const COLLECTIONS = ["posts", "projects", "pages"];
const SESSION_RE = /^[a-z0-9-]{8,64}$/;

type WriterSettings = { model: string; styleGuide: string; maxTokens: number };

export type Run = {
	createdAt: string;
	/** agent: the live writer; panel: the v2 one-shot fill (older runs only). */
	source: "agent" | "panel";
	collection: string;
	entryId: string;
	/** Field slug for a single-field rewrite, "*" for a whole entry. */
	field: string;
	model: string;
	brief: string;
	status: "ok" | "error";
	error?: string;
	written?: number;
	inputTokens?: number;
	outputTokens?: number;
	ms: number;
	todos?: number;
};

/** What the admin page needs to start or resume a writing session. */
export type SessionInfo = {
	token: string;
	model: string;
	modelLabel: string;
	mock: boolean;
	styleGuide: string;
	maxTokens: number;
	collection: string;
	collectionLabel: string;
	collectionDescription: string | null;
	targets: Target[];
	entryId: string | null;
	current: Record<string, unknown>;
	profile: Record<string, unknown>;
	tags: string[];
};

export type SearchHit = { collection: string; title: string; excerpt: string; url: string; tags: string[] };

async function settings(ctx: RouteContext): Promise<WriterSettings> {
	return {
		model: (await ctx.settings.get<string>("model")) || DEFAULT_MODEL,
		styleGuide: (await ctx.settings.get<string>("styleGuide"))?.trim() || DEFAULT_STYLE_GUIDE,
		maxTokens: (await ctx.settings.get<number>("maxTokens")) || DEFAULT_MAX_TOKENS,
	};
}

function input<T>(ctx: RouteContext): Partial<T> {
	return (ctx.input && typeof ctx.input === "object" ? ctx.input : {}) as Partial<T>;
}

function str(v: unknown): string {
	return typeof v === "string" ? v : "";
}

function errorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message;
}

async function saveRun(ctx: RouteContext, run: Run) {
	try {
		await ctx.storage.runs!.put(`${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, run);
	} catch (error) {
		ctx.log.warn(`ai-writer: could not log run: ${error instanceof Error ? error.message : error}`);
	}
}

// ── Routes for the writer page (all run under the admin's session) ──

/** Start or resume a session: signed agent token, settings, entry spec, current values, profile, tags. */
async function session(ctx: RouteContext): Promise<SessionInfo> {
	const { session: name, collection, entryId } = input<{ session: string; collection: string; entryId: string }>(ctx);
	if (!name || !SESSION_RE.test(name)) throw new Error("Invalid session id");
	if (!collection || !COLLECTIONS.includes(collection)) throw new Error(`Unsupported collection: ${collection}`);

	const secret = writerSecret(env as { AI_WRITER_SECRET?: string });
	if (!secret) throw new Error("AI_WRITER_SECRET is not set for this environment (wrangler secret put AI_WRITER_SECRET)");

	const [config, schema] = await Promise.all([settings(ctx), ctx.schema!.getCollection(collection)]);
	if (!schema) throw new Error(`Unknown collection: ${collection}`);
	const entry = entryId ? await ctx.content!.get(collection, entryId) : null;
	if (entryId && !entry) throw new Error("That entry no longer exists");

	return {
		token: await signToken(secret, name),
		model: config.model,
		modelLabel: MODELS.find((m) => m.value === config.model)?.label ?? config.model,
		mock: (env as { AI_WRITER_MOCK?: string }).AI_WRITER_MOCK === "1",
		styleGuide: config.styleGuide,
		maxTokens: config.maxTokens,
		collection,
		collectionLabel: schema.labelSingular ?? schema.label,
		collectionDescription: schema.description,
		targets: entrySpec(schema),
		entryId: entry?.id ?? null,
		current: entry?.data ?? {},
		profile: await profile(ctx),
		tags: await tagLabels(ctx, collection),
	};
}

/** The `profile` entry's facts, minus media and layout-only fields. */
async function profile(ctx: RouteContext): Promise<Record<string, unknown>> {
	try {
		const { items } = await ctx.content!.list("profile", { limit: 1 });
		const data = items[0]?.data ?? {};
		return Object.fromEntries(
			Object.entries(data).filter(([, v]) => v != null && v !== "" && !(typeof v === "object" && !Array.isArray(v) && "src" in (v as object))),
		);
	} catch {
		return {};
	}
}

async function tagLabels(ctx: RouteContext, collection: string): Promise<string[]> {
	try {
		const taxonomies = await ctx.taxonomies?.getAll();
		if (!taxonomies?.some((t) => t.name === "tag" && t.collections.includes(collection))) return [];
		return (await ctx.taxonomies!.getTerms("tag")).map((t) => t.label);
	} catch {
		return [];
	}
}

const PUBLIC_PATH: Record<string, string> = { posts: "/blog/", projects: "/projects/" };

/** Keyword search over published posts and projects, for links and related content. */
async function search(ctx: RouteContext): Promise<{ results: SearchHit[] }> {
	const { query, collection } = input<{ query: string; collection: string }>(ctx);
	const words = str(query).toLowerCase().split(/\W+/).filter((w) => w.length > 2);
	const collections = collection && PUBLIC_PATH[collection] ? [collection] : Object.keys(PUBLIC_PATH);
	const hits: Array<SearchHit & { score: number }> = [];
	for (const c of collections) {
		const { items } = await ctx.content!.list(c, { limit: 100, where: { status: "published" } });
		for (const item of items) {
			const title = str(item.data.title).replace(/\*/g, "");
			const excerpt = str(item.data.excerpt) || str(item.data.summary);
			const tags = ((item.data.terms as { tag?: Array<{ label?: string }> } | undefined)?.tag ?? []).map((t) => t.label ?? "").filter(Boolean);
			const haystack = `${title} ${excerpt} ${tags.join(" ")} ${item.slug ?? ""}`.toLowerCase();
			const score = words.length ? words.filter((w) => haystack.includes(w)).length : 1;
			if (score > 0) hits.push({ collection: c, title, excerpt: excerpt.slice(0, 240), url: `${PUBLIC_PATH[c]}${item.slug}`, tags, score });
		}
	}
	return { results: hits.sort((a, b) => b.score - a.score).slice(0, 8).map(({ score: _, ...hit }) => hit) };
}

/** Save the agent's fields: a new draft, or draft changes on an existing entry. Never publishes. */
async function save(ctx: RouteContext): Promise<{ id: string; collection: string; created: boolean }> {
	const { collection, entryId, fields } = input<{ collection: string; entryId: string | null; fields: Record<string, unknown> }>(ctx);
	if (!collection || !COLLECTIONS.includes(collection)) throw new Error(`Unsupported collection: ${collection}`);
	const schema = await ctx.schema!.getCollection(collection);
	if (!schema) throw new Error(`Unknown collection: ${collection}`);
	const writable = new Set(entrySpec(schema).map((t) => t.field));
	const data = Object.fromEntries(Object.entries(fields ?? {}).filter(([k]) => writable.has(k)));
	if (!Object.keys(data).length) throw new Error("Nothing to save yet");

	if (entryId) {
		const item = await ctx.content!.update!(collection, entryId, data);
		return { id: item.id, collection, created: false };
	}
	if (!data.title) throw new Error("Write a title first");
	// posts.date is required and orders the blog; today is the honest default.
	const item = await ctx.content!.create!(collection, collection === "posts" ? { date: new Date().toISOString(), ...data } : data);
	return { id: item.id, collection, created: true };
}

async function logRun(ctx: RouteContext) {
	const run = input<Run>(ctx);
	await saveRun(ctx, {
		createdAt: new Date().toISOString(),
		source: "agent",
		collection: str(run.collection),
		entryId: str(run.entryId),
		field: "*",
		model: str(run.model),
		brief: str(run.brief).slice(0, 2000),
		status: run.status === "error" ? "error" : "ok",
		...(run.error ? { error: str(run.error).slice(0, 500) } : {}),
		...(typeof run.written === "number" ? { written: run.written } : {}),
		...(typeof run.inputTokens === "number" ? { inputTokens: run.inputTokens, outputTokens: run.outputTokens } : {}),
		ms: typeof run.ms === "number" ? run.ms : 0,
		...(typeof run.todos === "number" ? { todos: run.todos } : {}),
	});
	return { ok: true };
}

async function runs(ctx: RouteContext): Promise<{ runs: Run[] }> {
	const { items } = await ctx.storage.runs!.query({ orderBy: { createdAt: "desc" }, limit: 50 });
	return { runs: items.map((item) => item.data as Run) };
}

// ── Plugin ──

const edit = "content:edit_own" as const;

/**
 * Thrown errors reach the browser as a generic "Plugin route error"; the
 * writer page shows `{ error }` instead, so it can say what went wrong.
 */
function safe<T>(handler: (ctx: RouteContext) => Promise<T>) {
	return async (ctx: RouteContext): Promise<T | { error: string }> => {
		try {
			return await handler(ctx);
		} catch (error) {
			ctx.log.warn(`ai-writer: ${errorMessage(error)}`);
			return { error: errorMessage(error) };
		}
	};
}

export function createPlugin() {
	return definePlugin({
		id: PLUGIN_ID,
		version: VERSION,
		capabilities: [
			// Profile facts and site search for the agent.
			"content:read",
			// Saving drafts; the plugin never publishes.
			"content:write",
			// Field list, types and block validation per collection.
			"schema:read",
			// Existing tags, for suggestions only.
			"taxonomies:read",
		],
		storage: {
			runs: { indexes: ["createdAt", "collection", "entryId"] },
		},
		routes: {
			session: { permission: edit, handler: safe(session) },
			search: { permission: edit, handler: safe(search) },
			save: { permission: edit, handler: safe(save) },
			"runs/log": { permission: edit, handler: safe(logRun) },
			runs: { permission: edit, handler: safe(runs) },
		},
		admin: {
			entry: ADMIN_ENTRY,
			pages: [
				{ path: "/new", label: "New with AI", icon: "magic-wand" },
				{ path: "/runs", label: "AI runs", icon: "list" },
			],
			settingsSchema: {
				model: {
					type: "select",
					label: "Model",
					description: "Workers AI text model for the writer agent. It must support tool calling.",
					options: MODELS.map((m) => ({ value: m.value, label: m.label })),
					default: DEFAULT_MODEL,
				},
				styleGuide: {
					type: "string",
					label: "Style guide",
					description: "System prompt: voice and house rules. The facts rule is always added.",
					multiline: true,
					default: DEFAULT_STYLE_GUIDE,
				},
				maxTokens: {
					type: "number",
					label: "Max output tokens",
					description: "Per model step (one set_field is one step). Reasoning models spend part of this thinking.",
					default: DEFAULT_MAX_TOKENS,
					min: 500,
					max: 32000,
				},
			},
		},
	});
}
