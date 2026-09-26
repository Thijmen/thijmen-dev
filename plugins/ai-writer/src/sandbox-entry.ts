import type { PluginContext, SandboxedPlugin, SandboxedRouteContext } from "emdash/plugin";

import { entrySpec, type Target } from "./entry-spec";
import { NothingToWrite, writeEntry, type EntryResult, type WriterSettings } from "./entry-writer";
import { DEFAULT_MAX_TOKENS, DEFAULT_MODEL, MODELS } from "./models";
import { ALL, banner, newEntryBlocks, type PanelState, panelBlocks, resultNotices } from "./panel";
import { DEFAULT_STYLE_GUIDE } from "./prompt";

type Draft = { fields: Record<string, unknown> };

type PanelInput =
	| { type: "panel_load" }
	| { type: "form_submit"; action_id: string; values: Record<string, unknown>; draft?: Draft }
	| { type: "block_action"; action_id: string; draft?: Draft };

type Run = {
	createdAt: string;
	source: "panel" | "new";
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

async function settings(ctx: PluginContext): Promise<WriterSettings> {
	return {
		model: (await ctx.settings.get<string>("model")) || DEFAULT_MODEL,
		styleGuide: (await ctx.settings.get<string>("styleGuide"))?.trim() || DEFAULT_STYLE_GUIDE,
		maxTokens: (await ctx.settings.get<number>("maxTokens")) || DEFAULT_MAX_TOKENS,
	};
}

async function targetsFor(ctx: PluginContext, collection: string): Promise<Target[]> {
	const schema = await ctx.schema?.getCollection(collection);
	return schema ? entrySpec(schema) : [];
}

function text(values: Record<string, unknown> | undefined, key: string): string {
	const v = values?.[key];
	return typeof v === "string" ? v : "";
}

function errorMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return /run remotely/i.test(message) ? `${message}. Local dev has no Workers AI: restart with \`pnpm dev:ai\`.` : message;
}

// ── Editor panel: fill the saved entry's empty fields as one unsaved patch ──

async function write(routeCtx: SandboxedRouteContext, ctx: PluginContext) {
	const input = routeCtx.input as PanelInput;
	const entry = routeCtx.ui?.entry;
	const collection = entry?.collection ?? "";
	const [targets, config] = await Promise.all([targetsFor(ctx, collection), settings(ctx)]);

	if (input.type !== "form_submit") {
		return { blocks: panelBlocks(targets, { brief: "", only: ALL }, config.model) };
	}

	const state: PanelState = { brief: text(input.values, "brief"), only: text(input.values, "only") || ALL };
	const reply = (...notices: object[]) => ({ blocks: panelBlocks(targets, state, config.model, notices) });

	if (!state.brief.trim()) return reply(banner("alert", "Write a brief first", "Even a line helps: the topic and the point you want to make."));
	if (!input.draft) return reply(banner("error", "The editor sent no draft", "Reload the entry and try again."));

	const only = state.only === ALL ? undefined : state.only;
	const run = newRun("panel", collection, entry?.id ?? "", only ?? "*", config.model, state.brief);
	const started = Date.now();
	try {
		const result = await writeEntry(ctx, config, { collection, brief: state.brief.trim(), fields: input.draft.fields, only });
		await saveRun(ctx, finishRun(run, started, result));
		return {
			blocks: panelBlocks(targets, state, config.model, resultNotices(result, run.ms, "Review the preview, then save")),
			patch: {
				type: "editor-draft-patch",
				operations: Object.entries(result.values).map(([field, value]) => ({ op: "set", field, value })),
			},
		};
	} catch (error) {
		if (error instanceof NothingToWrite) {
			return reply(banner("alert", error.message, "Pick one field under Write to rewrite it."));
		}
		await saveRun(ctx, failRun(run, started, error));
		ctx.log.error(`ai-writer: ${collection}/${entry?.id} failed: ${errorMessage(error)}`);
		return reply(banner("error", "Writing failed", errorMessage(error)));
	}
}

// ── Admin pages: "New with AI" and the run log ──

async function admin(routeCtx: SandboxedRouteContext, ctx: PluginContext) {
	const input = routeCtx.input as { type?: string; page?: string; action_id?: string; values?: Record<string, unknown> };
	if (input?.page === "/runs" && input.type === "page_load") return runsPage(ctx);
	if (input?.page === "/new") return newEntryPage(input, ctx);
	return { blocks: [] };
}

const REQUIRED_DEFAULTS: Record<string, () => Record<string, unknown>> = {
	// posts.date is required and orders the blog; now is the honest default.
	posts: () => ({ date: new Date().toISOString() }),
};

async function newEntryPage(input: { type?: string; values?: Record<string, unknown> }, ctx: PluginContext) {
	const config = await settings(ctx);
	const collection = ["posts", "projects", "pages"].includes(text(input.values, "collection")) ? text(input.values, "collection") : "posts";
	const state = { collection, title: text(input.values, "title"), brief: text(input.values, "brief") };
	const page = (...notices: object[]) => ({ blocks: newEntryBlocks(state, config.model, notices) });

	if (input.type !== "form_submit") return page();
	if (!state.brief.trim()) return page(banner("alert", "Write a brief first"));

	const run = newRun("new", collection, "", "*", config.model, state.brief);
	const started = Date.now();
	try {
		const given = state.title.trim() ? { title: state.title.trim() } : {};
		const result = await writeEntry(ctx, config, { collection, brief: state.brief.trim(), fields: given });
		const data = { ...REQUIRED_DEFAULTS[collection]?.(), ...given, ...result.values };
		if (!data.title) throw new Error("The model wrote no title; add one and try again");
		const item = await ctx.content!.create!(collection, data);
		run.entryId = item.id;
		await saveRun(ctx, finishRun(run, started, result));
		return {
			blocks: newEntryBlocks({ ...state, title: "", brief: "" }, config.model, [
				...resultNotices(result, run.ms, `Draft created: ${String(data.title).replace(/\*/g, "")}`),
				{
					type: "actions",
					elements: [{ type: "link", label: "Open in the editor →", appearance: "primary", target: { kind: "content", collection, id: item.id } }],
				},
			]),
			toast: { type: "success", message: "Draft created" },
		};
	} catch (error) {
		await saveRun(ctx, failRun(run, started, error));
		ctx.log.error(`ai-writer: new ${collection} failed: ${errorMessage(error)}`);
		return page(banner("error", "Writing failed", errorMessage(error)));
	}
}

async function runsPage(ctx: PluginContext) {
	const { items } = await ctx.storage.runs!.query({ orderBy: { createdAt: "desc" }, limit: 50 });
	const runs = items.map((item) => item.data as Run);
	const labels = new Map<string, string>(MODELS.map((m) => [m.value, m.label]));
	return {
		blocks: [
			{ type: "header", text: "AI runs" },
			{ type: "context", text: "The last 50 runs from the editor panel and New with AI." },
			{
				type: "table",
				block_id: "runs",
				page_action_id: "runs_page",
				empty_text: "No runs yet. Use New with AI, or the AI writer panel on a saved entry.",
				columns: [
					{ key: "createdAt", label: "When", format: "relative_time" },
					{ key: "status", label: "Status", format: "badge" },
					{ key: "target", label: "Target", format: "code" },
					{ key: "model", label: "Model", format: "text" },
					{ key: "tokens", label: "Tokens in/out", format: "text" },
					{ key: "seconds", label: "Time", format: "text" },
					{ key: "notes", label: "Notes", format: "text" },
				],
				rows: runs.map((r) => ({
					createdAt: r.createdAt,
					status: r.status,
					target: `${r.source === "new" ? "new " : ""}${r.collection}${r.field === "*" ? "" : `.${r.field}`}`,
					model: labels.get(r.model) ?? r.model,
					tokens: r.inputTokens != null ? `${r.inputTokens} / ${r.outputTokens}` : "–",
					seconds: `${(r.ms / 1000).toFixed(1)}s`,
					notes:
						r.status === "error"
							? r.error
							: [`${r.written ?? 0} fields`, r.todos ? `${r.todos} TODO` : "", r.brief.slice(0, 60)].filter(Boolean).join(" · "),
				})),
			},
		],
	};
}

// ── Run log ──

function newRun(source: Run["source"], collection: string, entryId: string, field: string, model: string, brief: string): Run {
	return { createdAt: new Date().toISOString(), source, collection, entryId, field, model, brief: brief.slice(0, 2000), status: "ok", ms: 0 };
}

function finishRun(run: Run, started: number, result: EntryResult): Run {
	return Object.assign(run, {
		ms: Date.now() - started,
		written: result.written.length,
		todos: result.todos,
		inputTokens: result.usage?.input,
		outputTokens: result.usage?.output,
	});
}

function failRun(run: Run, started: number, error: unknown): Run {
	return Object.assign(run, { status: "error" as const, error: errorMessage(error).slice(0, 500), ms: Date.now() - started });
}

async function saveRun(ctx: PluginContext, run: Run) {
	try {
		await ctx.storage.runs!.put(`${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, run);
	} catch (error) {
		ctx.log.warn(`ai-writer: could not log run: ${error instanceof Error ? error.message : error}`);
	}
}

export default {
	routes: {
		"editor/write": { permission: "content:edit_own", handler: write },
		admin: { handler: admin },
	},
} satisfies SandboxedPlugin;
