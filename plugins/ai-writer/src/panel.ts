import type { EntryResult } from "./entry-writer";
import type { Target } from "./entry-spec";

// Block Kit JSON for the editor panel and the admin pages. Plain objects, so
// the plugin needs no dependency on @emdash-cms/blocks.

export const ALL = "__empty";

export type PanelState = { brief: string; only: string };

export function panelBlocks(targets: Target[], state: PanelState, model: string, notices: object[] = []): object[] {
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
					placeholder: "What it's about, the points to make, facts to use (numbers, names, links). The rest becomes [TODO] markers.",
					multiline: true,
					initial_value: state.brief,
				},
				{
					type: "select",
					action_id: "only",
					label: "Write",
					options: [
						{ label: "Every empty field", value: ALL },
						...targets.map((t) => ({ label: `Only ${t.label.toLowerCase()} (rewrites it)`, value: t.field })),
					],
					initial_value: state.only,
				},
			],
			submit: { label: "Write entry", action_id: "write" },
		},
		{
			type: "context",
			text: `${shortModel(model)} · fills title, short fields, body and blocks from the brief. Opens as a preview; nothing is saved until you save.`,
		},
	];
}

export function newEntryBlocks(state: { collection: string; title: string; brief: string }, model: string, notices: object[] = []): object[] {
	return [
		{ type: "header", text: "New with AI" },
		{
			type: "context",
			text: `Creates a draft from a brief with every prose field filled (${shortModel(model)}). Dates, images, links and tags stay yours. Nothing is published.`,
		},
		...notices,
		{
			type: "form",
			block_id: "new",
			fields: [
				{
					type: "radio",
					action_id: "collection",
					label: "Type",
					options: [
						{ label: "Blog post", value: "posts" },
						{ label: "Project", value: "projects" },
						{ label: "Page", value: "pages" },
					],
					initial_value: state.collection,
				},
				{ type: "text_input", action_id: "title", label: "Title (optional)", placeholder: "Leave empty to have one written", initial_value: state.title },
				{
					type: "text_input",
					action_id: "brief",
					label: "Brief",
					placeholder: "What it's about, the points to make, facts to use (numbers, names, links). The rest becomes [TODO] markers.",
					multiline: true,
					initial_value: state.brief,
				},
			],
			submit: { label: "Write draft", action_id: "create" },
		},
	];
}

/** Banners summarising a run: what was written, TODOs, dropped blocks, tag suggestions. */
export function resultNotices(result: EntryResult, ms: number, lead: string): object[] {
	return [
		banner("default", lead, `Wrote ${result.written.join(", ")} in ${(ms / 1000).toFixed(1)}s.${result.skipped.length ? ` Left empty: ${result.skipped.join(", ")}.` : ""}`),
		...(result.todos
			? [banner("alert", `${result.todos} [TODO] ${result.todos === 1 ? "marker" : "markers"} to resolve`, "Facts the model didn't have. Fill them in before publishing.")]
			: []),
		...(result.dropped.length
			? [banner("alert", `Dropped ${result.dropped.length} invalid ${result.dropped.length === 1 ? "block" : "blocks"}`, result.dropped.join("; "))]
			: []),
		...(result.tags.length ? [{ type: "fields", fields: [{ label: "Suggested tags", value: result.tags.join(", ") }] }] : []),
	];
}

export function banner(variant: "default" | "alert" | "error", title: string, description?: string): object {
	return { type: "banner", variant, title, ...(description ? { description } : {}) };
}

function shortModel(model: string): string {
	return model.replace(/^@cf\/[^/]+\//, "");
}
