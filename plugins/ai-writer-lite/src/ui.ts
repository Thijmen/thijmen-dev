/**
 * Block Kit JSON for the admin pages and the editor panel. Plain objects
 * typed against @emdash-cms/blocks, so nothing from that package (or React)
 * ends up in the sandbox bundle.
 */
import type { Block, FormField } from "@emdash-cms/blocks/server";

import { type Config, DEFAULT_GATEWAY, DEFAULT_MAX_TOKENS } from "./config";
import type { Target } from "./fields";
import { CUSTOM, labelFor, MODELS } from "./models";
import type { Run } from "./cms";
import type { EntryResult } from "./writer";

export const ALL = "__empty";
export const SETTINGS_PAGE = "/settings";
export const NEW_PAGE = "/new";
export const RUNS_PAGE = "/runs";

const BRIEF_PLACEHOLDER = "What it's about, the points to make, facts to use (names, numbers, links). Anything missing becomes a [TODO] marker.";

export function banner(variant: "default" | "alert" | "error", title: string, description?: string): Block {
	return { type: "banner", variant, title, ...(description ? { description } : {}) };
}

function settingsLink(label = "Open AI writer settings"): Block {
	return { type: "actions", elements: [{ type: "link", label, target: { kind: "plugin-page", path: SETTINGS_PAGE } }] };
}

/** Shown instead of a form while the account, token or model is missing. */
export function setupNotice(problem: string): Block[] {
	return [banner("alert", "Connect Cloudflare first", problem), settingsLink()];
}

function modelLine(config: Config): string {
	return labelFor(config.model);
}

// ── Editor panel ──

export type PanelState = { brief: string; only: string };

export function panelBlocks(targets: Target[], filled: Set<string>, state: PanelState, config: Config, notices: Block[] = []): Block[] {
	const empty = targets.filter((t) => !filled.has(t.field));
	return [
		...notices,
		{
			type: "form",
			block_id: "write",
			fields: [
				{
					type: "text_input",
					action_id: "brief",
					label: "Brief",
					placeholder: filled.size ? "Optional: what to write or change. Leave empty to fill the empty fields from what's there." : BRIEF_PLACEHOLDER,
					multiline: true,
					...(state.brief ? { initial_value: state.brief } : {}),
				},
				{
					type: "select",
					action_id: "only",
					label: "Write",
					options: [
						{ label: empty.length ? `Every empty field (${empty.length})` : "Every empty field (none left)", value: ALL },
						...targets.map((t) => ({ label: `Only ${t.label.toLowerCase()} (${filled.has(t.field) ? "rewrites it" : "empty"})`, value: t.field })),
					],
					initial_value: state.only,
				},
			],
			submit: { label: "Write", action_id: "write" },
		},
		{
			type: "context",
			text: `${modelLine(config)} · Works from the saved version and saves the result as draft changes, then reloads the editor. Save your own edits first. Nothing is published.`,
		},
	];
}

// ── New with AI ──

export type NewState = { collection: string; brief: string };

export function newEntryBlocks(collections: Array<{ slug: string; label: string }>, state: NewState, config: Config, notices: Block[] = []): Block[] {
	if (!collections.length) {
		return [
			{ type: "header", text: "New with AI" },
			...notices,
			{ type: "empty", title: "Nothing to write", description: "No visible collection has a text or rich-text field the writer can fill." },
		];
	}
	return [
		{ type: "header", text: "New with AI" },
		{
			type: "context",
			text: `Writes a draft from a brief with every text field filled (${modelLine(config)}). Dates, images, links and tags stay yours. Nothing is published.`,
		},
		...notices,
		{
			type: "form",
			block_id: "new",
			fields: [
				{
					type: "select",
					action_id: "collection",
					label: "Type",
					options: collections.map((c) => ({ label: c.label, value: c.slug })),
					initial_value: state.collection,
				},
				{ type: "text_input", action_id: "brief", label: "Brief", placeholder: BRIEF_PLACEHOLDER, multiline: true, ...(state.brief ? { initial_value: state.brief } : {}) },
			],
			submit: { label: "Write draft", action_id: "create" },
		},
	];
}

/** Banners summarising a run: what was written, TODOs, suggested terms. */
export function resultNotices(result: EntryResult, lead: string, termLabel?: string): Block[] {
	const seconds = (result.ms / 1000).toFixed(1);
	return [
		banner("default", lead, `Wrote ${result.written.join(", ")} in ${seconds}s.${result.skipped.length ? ` Left empty: ${result.skipped.join(", ")}.` : ""}`),
		...(result.todos
			? [banner("alert", `${result.todos} [TODO] ${result.todos === 1 ? "marker" : "markers"} to resolve`, "Facts the model didn't have. Fill them in before publishing.")]
			: []),
		...(result.terms.length ? [{ type: "fields" as const, fields: [{ label: `Suggested ${termLabel?.toLowerCase() ?? "terms"}`, value: result.terms.join(", ") }] }] : []),
	];
}

export function summary(result: EntryResult): string {
	const todo = result.todos ? ` · ${result.todos} TODO` : "";
	return `Wrote ${result.written.join(", ")}${todo}`;
}

// ── AI runs ──

export function runsBlocks(runs: Run[]): Block[] {
	return [
		{ type: "header", text: "AI runs" },
		{ type: "context", text: "The last 50 runs from New with AI and the editor panel." },
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
				{ key: "open", label: "", format: "element" },
			],
			rows: runs.map((r) => ({
				createdAt: r.createdAt,
				status: r.status,
				target: `${r.source === "new" ? "new " : ""}${r.collection}${r.field === "*" ? "" : `.${r.field}`}`,
				model: labelFor(r.model),
				tokens: r.inputTokens != null ? `${r.inputTokens} / ${r.outputTokens}` : "–",
				seconds: `${(r.ms / 1000).toFixed(1)}s`,
				notes: r.status === "error" ? (r.error ?? "") : [`${r.written ?? 0} fields`, r.todos ? `${r.todos} TODO` : "", r.brief.slice(0, 60)].filter(Boolean).join(" · "),
				...(r.entryId ? { open: { type: "link", label: "Open", target: { kind: "content", collection: r.collection, id: r.entryId } } } : {}),
			})),
		},
	];
}

// ── Settings ──

export function settingsBlocks(config: Config, hasToken: boolean, canEdit: boolean, notices: Block[] = []): Block[] {
	const intro: Block[] = [
		{ type: "header", text: "AI writer settings" },
		{
			type: "context",
			text: "The writer calls Cloudflare's AI API with your account: Workers AI models (@cf/…) are billed as Workers AI usage, other models through AI Gateway credits. Create an API token with the Account → Workers AI → Read permission.",
		},
		...notices,
	];
	if (!canEdit) {
		return [
			...intro,
			banner("alert", "Only administrators can change these settings"),
			{
				type: "fields",
				fields: [
					{ label: "Model", value: labelFor(config.model) || "–" },
					{ label: "Account", value: config.accountId ? "connected" : "not set" },
				],
			},
		];
	}
	const fields: FormField[] = [
		{ type: "text_input", action_id: "accountId", label: "Cloudflare account ID", placeholder: "32-character id from the dashboard URL", ...(config.accountId ? { initial_value: config.accountId } : {}) },
		{ type: "secret_input", action_id: "apiToken", label: "Cloudflare API token", placeholder: "Account → Workers AI → Read", has_value: hasToken },
		{ type: "text_input", action_id: "gateway", label: "AI Gateway id", placeholder: DEFAULT_GATEWAY, initial_value: config.gateway },
		{
			type: "select",
			action_id: "model",
			label: "Model",
			options: [...MODELS.map((m) => ({ label: m.label, value: m.value })), { label: "Custom model id…", value: CUSTOM }],
			initial_value: config.modelChoice,
		},
		{
			type: "text_input",
			action_id: "customModel",
			label: "Custom model id",
			placeholder: "e.g. @cf/qwen/qwen3.8-27b or openai/gpt-5.5",
			...(config.customModel ? { initial_value: config.customModel } : {}),
			condition: { field: "model", eq: CUSTOM },
		},
		{ type: "number_input", action_id: "maxTokens", label: "Max output tokens", min: 256, max: 16000, initial_value: config.maxTokens || DEFAULT_MAX_TOKENS },
		{
			type: "text_input",
			action_id: "about",
			label: "About you and the site",
			placeholder: "Facts the writer may use: who writes here, role, what the site is about, links. It never invents these.",
			multiline: true,
			...(config.about ? { initial_value: config.about } : {}),
		},
		{
			type: "text_input",
			action_id: "styleGuide",
			label: "Style guide",
			placeholder: "Voice and house rules. Clear it to go back to the default.",
			multiline: true,
			initial_value: config.styleGuide,
		},
		{
			type: "text_input",
			action_id: "skipFields",
			label: "Fields to skip",
			placeholder: "Comma-separated field slugs, or collection.field, e.g. subtitle, posts.cover_caption",
			...(config.skipFields.length ? { initial_value: config.skipFields.join(", ") } : {}),
		},
	];
	return [
		...intro,
		{ type: "form", block_id: "settings", fields, submit: { label: "Save", action_id: "save" } },
		{
			type: "actions",
			elements: [{ type: "button", action_id: "test", label: "Test connection", style: "secondary" }],
		},
		{ type: "context", text: "Test connection sends one short request to the selected model. A whole entry has to come back within 24 seconds (the sandbox allows 30), so prefer fast models." },
	];
}
