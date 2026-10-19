/**
 * CMS reads and the run log. Every call here crosses the sandbox bridge,
 * and a request may make 10 calls out in total, so each helper makes as few
 * as it can.
 */
import type { PluginContext } from "emdash/plugin";

import type { Target } from "./fields";
import type { CollectionSchemaInfo, ContentItem } from "./types";
import type { Terms } from "./writer";

/**
 * The entry as the editor shows it: the saved row with its pending draft
 * revision on top. `content.get` returns the row only, so on a collection
 * with revisions an unpublished change would otherwise be invisible.
 */
export async function currentValues(ctx: PluginContext, collection: string, item: ContentItem): Promise<Record<string, unknown>> {
	let data: Record<string, unknown> = { ...item.data };
	if (item.draftRevisionId && ctx.content?.getRevision) {
		const draft = await ctx.content.getRevision(collection, item.id, item.draftRevisionId).catch(() => null);
		if (draft?.data) data = { ...data, ...draft.data };
	}
	return data;
}

/** Labels for every field, so the prompt can name the context it passes. */
export function fieldLabels(schema: CollectionSchemaInfo): Record<string, string> {
	return Object.fromEntries(schema.fields.map((f) => [f.slug, f.label]));
}

/**
 * Existing terms the writer may suggest: from one taxonomy attached to the
 * collection, flat ones (tags) before hierarchical ones (categories).
 * Two bridge calls; none when the collection has no taxonomy.
 */
export async function suggestibleTerms(ctx: PluginContext, collection: string): Promise<Terms | null> {
	if (!ctx.taxonomies) return null;
	try {
		const all = await ctx.taxonomies.getAll();
		const attached = all.filter((t) => t.collections.includes(collection)).sort((a, b) => Number(a.hierarchical) - Number(b.hierarchical));
		const taxonomy = attached[0];
		if (!taxonomy) return null;
		const terms = await ctx.taxonomies.getTerms(taxonomy.name);
		if (!terms.length) return null;
		return { taxonomy: taxonomy.name, label: taxonomy.label, terms: terms.slice(0, 150).map((t) => ({ id: t.id, slug: t.slug, label: t.label })) };
	} catch (error) {
		ctx.log.warn(`ai-writer-lite: could not read terms: ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}

/** Collections an editor can write with the plugin: visible, with at least one writable field. */
export function writableCollections(collections: CollectionSchemaInfo[], targetsOf: (c: CollectionSchemaInfo) => Target[]): CollectionSchemaInfo[] {
	return collections.filter((c) => !c.hidden && targetsOf(c).length > 0);
}

// ── Run log ──

export type Run = {
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

export function newRun(source: Run["source"], collection: string, entryId: string, field: string, model: string, brief: string): Run {
	return { createdAt: new Date().toISOString(), source, collection, entryId, field, model, brief: brief.slice(0, 1000), status: "ok", ms: 0 };
}

export async function saveRun(ctx: PluginContext, run: Run): Promise<void> {
	try {
		await ctx.storage.runs.put(`${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, run);
	} catch (error) {
		ctx.log.warn(`ai-writer-lite: could not log run: ${error instanceof Error ? error.message : String(error)}`);
	}
}

export async function recentRuns(ctx: PluginContext, limit = 50): Promise<Run[]> {
	const { items } = await ctx.storage.runs.query({ orderBy: { createdAt: "desc" }, limit });
	return items.map((item) => item.data as Run);
}
