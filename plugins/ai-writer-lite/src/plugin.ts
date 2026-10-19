/**
 * AI writer (registry edition): writes entries from a brief with any model
 * Cloudflare serves, inside EmDash's plugin sandbox.
 *
 * - "New with AI" (admin page): a brief in, a draft out, every text field filled.
 * - "AI writer" (editor panel on any saved entry): fills the empty fields, or
 *   rewrites one, and saves the result as draft changes.
 * - "AI runs" and "AI writer settings" (admin pages).
 *
 * Every model call goes to api.cloudflare.com with the site's own token, and
 * has to finish inside the sandbox's 30-second limit. It never publishes.
 */
import type { Block } from "@emdash-cms/blocks/server";
import type { PluginContext, SandboxedPlugin, SandboxedRouteContext } from "emdash/plugin";

import { currentValues, fieldLabels, newRun, type Run, recentRuns, saveRun, suggestibleTerms, writableCollections } from "./cms";
import { type Config, readConfig, saveConfig, type SettingsForm, setupProblem } from "./config";
import { hasValue, requiredDefaults, type Target, unfillableRequired, writableTargets } from "./fields";
import { complete } from "./model-client";
import { MODELS } from "./models";
import type { CollectionSchemaInfo } from "./types";
import {
	ALL,
	banner,
	NEW_PAGE,
	newEntryBlocks,
	type NewState,
	type PanelState,
	panelBlocks,
	resultNotices,
	RUNS_PAGE,
	runsBlocks,
	SETTINGS_PAGE,
	settingsBlocks,
	setupNotice,
	summary,
} from "./ui";
import { type EntryResult, NothingToWrite, writeEntry } from "./writer";

/** EmDash role levels: settings hold the API token, so only admins change them. */
const ADMIN_ROLE = 50;

type Interaction =
	| { type: "page_load"; page: string }
	| { type: "panel_load" }
	| { type: "block_action"; action_id: string; page?: string; value?: unknown }
	| { type: "form_submit"; action_id: string; page?: string; values: Record<string, unknown> };

/** Validate the interaction the admin sends; anything else is ignored. */
function parseInteraction(input: unknown): Interaction | null {
	if (!input || typeof input !== "object") return null;
	const i = input as Record<string, unknown>;
	const page = typeof i.page === "string" ? i.page : undefined;
	switch (i.type) {
		case "page_load":
			return page ? { type: "page_load", page } : null;
		case "panel_load":
			return { type: "panel_load" };
		case "block_action":
			return typeof i.action_id === "string" ? { type: "block_action", action_id: i.action_id, page, value: i.value } : null;
		case "form_submit":
			return typeof i.action_id === "string" && i.values && typeof i.values === "object"
				? { type: "form_submit", action_id: i.action_id, page, values: i.values as Record<string, unknown> }
				: null;
		default:
			return null;
	}
}

function text(values: Record<string, unknown> | undefined, key: string): string {
	const v = values?.[key];
	return typeof v === "string" ? v : "";
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function targetsFor(schema: CollectionSchemaInfo, config: Config): Target[] {
	return writableTargets(schema, { skip: config.skipFields });
}

function finishRun(run: Run, result: EntryResult): Run {
	return Object.assign(run, {
		ms: result.ms,
		written: result.written.length,
		todos: result.todos,
		...(result.usage ? { inputTokens: result.usage.input, outputTokens: result.usage.output } : {}),
	});
}

function failRun(run: Run, started: number, error: unknown): Run {
	return Object.assign(run, { status: "error" as const, error: errorMessage(error).slice(0, 500), ms: Date.now() - started });
}

// ── Admin pages ──

async function admin(routeCtx: SandboxedRouteContext, ctx: PluginContext) {
	const interaction = parseInteraction(routeCtx.input);
	if (!interaction || interaction.type === "panel_load") return { blocks: [] };
	const page = interaction.page;
	if (page === NEW_PAGE) return newEntryPage(interaction, ctx);
	if (page === RUNS_PAGE) return { blocks: runsBlocks(await recentRuns(ctx)) };
	if (page === SETTINGS_PAGE) return settingsPage(interaction, routeCtx, ctx);
	return { blocks: [] };
}

async function newEntryPage(interaction: Interaction, ctx: PluginContext) {
	const [config, collections] = await Promise.all([readConfig(ctx), ctx.schema!.listCollections()]);
	const usable = writableCollections(collections, (c) => targetsFor(c, config));
	const options = usable.map((c) => ({ slug: c.slug, label: c.labelSingular ?? c.label }));
	const values = interaction.type === "form_submit" ? interaction.values : undefined;
	const chosen = usable.find((c) => c.slug === text(values, "collection")) ?? usable[0];
	const state: NewState = { collection: chosen?.slug ?? "", brief: text(values, "brief") };
	const page = (...notices: Block[]) => ({ blocks: newEntryBlocks(options, state, config, notices) });

	const problem = setupProblem(config);
	if (interaction.type !== "form_submit" || interaction.action_id !== "create") return page(...(problem ? setupNotice(problem) : []));
	if (problem) return page(...setupNotice(problem));
	if (!chosen) return page();
	if (!state.brief.trim()) return page(banner("alert", "Write a brief first", "Even a line helps: the topic and the point you want to make."));

	const targets = targetsFor(chosen, config);
	const missing = unfillableRequired(chosen, targets);
	if (missing.length) {
		return page(
			banner(
				"error",
				`${chosen.labelSingular ?? chosen.label} needs fields the writer can't fill`,
				`Required without a default: ${missing.map((f) => f.label).join(", ")}. Give them a default value in the schema, or make them optional.`,
			),
		);
	}

	const run = newRun("new", chosen.slug, "", "*", config.model, state.brief);
	const started = Date.now();
	try {
		const terms = await suggestibleTerms(ctx, chosen.slug);
		const result = await writeEntry(ctx, config, {
			collection: chosen.slug,
			collectionLabel: chosen.labelSingular ?? chosen.label,
			collectionDescription: chosen.description,
			targets,
			brief: state.brief.trim(),
			fields: {},
			labels: fieldLabels(chosen),
			terms,
			model: config.model,
		});
		const data = { ...requiredDefaults(chosen, targets), ...result.values };
		const item = await ctx.content!.create!(chosen.slug, data);
		run.entryId = item.id;
		await saveRun(ctx, finishRun(run, result));
		const titleValue = data[targets.find((t) => t.kind === "title")?.field ?? ""];
		const title = typeof titleValue === "string" ? titleValue : "";
		return {
			blocks: newEntryBlocks(options, { ...state, brief: "" }, config, [
				...resultNotices(result, title ? `Draft created: ${title}` : "Draft created", terms?.label),
				{ type: "actions", elements: [{ type: "link", label: "Open the draft", appearance: "primary", target: { kind: "content", collection: chosen.slug, id: item.id } }] },
			]),
			toast: { type: "success" as const, message: "Draft created" },
		};
	} catch (error) {
		await saveRun(ctx, failRun(run, started, error));
		ctx.log.error(`ai-writer-lite: new ${chosen.slug} failed: ${errorMessage(error)}`);
		return page(banner("error", "Writing failed", errorMessage(error)));
	}
}

async function settingsPage(interaction: Interaction, routeCtx: SandboxedRouteContext, ctx: PluginContext) {
	const canEdit = (routeCtx.user?.role ?? 0) >= ADMIN_ROLE;
	let config = await readConfig(ctx);
	const page = (...notices: Block[]) => ({ blocks: settingsBlocks(config, Boolean(config.apiToken), canEdit, notices) });

	if (interaction.type === "form_submit" && interaction.action_id === "save") {
		if (!canEdit) return page(banner("error", "Only administrators can change these settings"));
		const error = await saveConfig(ctx, interaction.values as SettingsForm, MODELS.map((m) => m.value));
		if (error) return page(banner("error", "Not saved", error));
		config = await readConfig(ctx);
		return { ...page(), toast: { type: "success" as const, message: "Settings saved" } };
	}

	if (interaction.type === "block_action" && interaction.action_id === "test") {
		const problem = setupProblem(config);
		if (problem) return page(banner("alert", "Not connected yet", problem));
		try {
			// Room for a reasoning model to think before it answers.
			const reply = await complete(ctx, config, config.model, [{ role: "user", content: "Reply with the single word OK." }], 512);
			return page(banner("default", "Connected", `${config.model} answered in ${(reply.ms / 1000).toFixed(1)}s.`));
		} catch (error) {
			return page(banner("error", "Connection failed", errorMessage(error)));
		}
	}

	return page();
}

// ── Editor panel ──

async function editorPanel(routeCtx: SandboxedRouteContext, ctx: PluginContext) {
	const interaction = parseInteraction(routeCtx.input);
	const entry = routeCtx.ui?.entry;
	if (!interaction || !entry) return { blocks: [banner("error", "No entry", "Open the writer from a saved entry.")] };

	const [config, schema, item] = await Promise.all([readConfig(ctx), ctx.schema!.getCollection(entry.collection), ctx.content!.get(entry.collection, entry.id)]);
	if (!schema) return { blocks: [banner("error", "Unknown collection", entry.collection)] };
	if (!item) return { blocks: [banner("alert", "Save the entry first", "The writer works from the saved version.")] };
	const targets = targetsFor(schema, config);
	if (!targets.length) return { blocks: [{ type: "context", text: "This collection has no text fields the writer can fill." } satisfies Block] };

	// Without revisions an update changes the entry itself, live if it's published.
	if (!schema.supports.includes("revisions") && item.status !== "draft") {
		return {
			blocks: [
				banner(
					"alert",
					"Only drafts in this collection",
					`${schema.label} has no draft revisions, so saving here would change the ${item.status} entry directly. Unpublish it first, or start from New with AI.`,
				),
			],
		};
	}

	const fields = await currentValues(ctx, entry.collection, item);
	const filled = new Set(targets.filter((t) => hasValue(fields[t.field])).map((t) => t.field));
	const values = interaction.type === "form_submit" ? interaction.values : undefined;
	const state: PanelState = { brief: text(values, "brief"), only: text(values, "only") || ALL };
	const reply = (...notices: Block[]) => ({ blocks: panelBlocks(targets, filled, state, config, notices) });

	const problem = setupProblem(config);
	if (interaction.type !== "form_submit" || interaction.action_id !== "write") return reply(...(problem ? setupNotice(problem) : []));
	if (problem) return reply(...setupNotice(problem));

	const only = state.only === ALL ? undefined : state.only;
	const brief = state.brief.trim();
	const anyContent = Object.values(fields).some(hasValue);
	if (!brief && !only && !anyContent) return reply(banner("alert", "Write a brief first", "The entry is empty, so the writer needs to know what it's about."));

	const run = newRun("panel", entry.collection, entry.id, only ?? "*", config.model, brief);
	const started = Date.now();
	try {
		const terms = only ? null : await suggestibleTerms(ctx, entry.collection);
		const result = await writeEntry(ctx, config, {
			collection: entry.collection,
			collectionLabel: schema.labelSingular ?? schema.label,
			collectionDescription: schema.description,
			targets,
			brief,
			fields,
			labels: fieldLabels(schema),
			only,
			terms,
			model: config.model,
		});
		await ctx.content!.update!(entry.collection, entry.id, result.values);
		await saveRun(ctx, finishRun(run, result));
		for (const field of Object.keys(result.values)) filled.add(field);
		return {
			blocks: panelBlocks(targets, filled, { brief: "", only: ALL }, config, resultNotices(result, "Saved as draft changes", terms?.label)),
			toast: { type: "success" as const, message: summary(result) },
			refresh: true as const,
		};
	} catch (error) {
		if (error instanceof NothingToWrite) return reply(banner("alert", error.message, "Pick one field under Write to rewrite it."));
		await saveRun(ctx, failRun(run, started, error));
		ctx.log.error(`ai-writer-lite: ${entry.collection}/${entry.id} failed: ${errorMessage(error)}`);
		return reply(banner("error", "Writing failed", errorMessage(error)));
	}
}

const plugin: SandboxedPlugin = {
	routes: {
		// Pages: New with AI (authors and up), AI runs, settings (saving is admin-only, checked in the handler).
		admin: { permission: "content:create", handler: admin },
		// The host also reloads the saved entry and checks its owner before calling this.
		"editor/write": { permission: "content:edit_own", handler: editorPanel },
	},
};

export default plugin;
