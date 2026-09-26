import type { PluginContext } from "emdash/plugin";

import { generate } from "./ai";
import { allowedBlockTypes, maxBlocks, normaliseBlocks, unfence } from "./blocks";
import { entrySpec, type Target } from "./entry-spec";
import { markdownToPortableText } from "./markdown-to-pt";
import { buildEntryMessages } from "./prompt";

export type WriterSettings = { model: string; styleGuide: string; maxTokens: number };

export type EntryResult = {
	/** Field values ready for a patch or `content.create`. */
	values: Record<string, unknown>;
	/** Target labels that got a value, in order. */
	written: string[];
	/** Target labels the model left out or wrote unusably. */
	skipped: string[];
	/** Blocks dropped by validation, with the reason. */
	dropped: string[];
	todos: number;
	/** Suggested existing tags (labels). */
	tags: string[];
	usage: { input: number; output: number } | null;
	chars: number;
};

type WriteInput = {
	collection: string;
	brief: string;
	/** Current values (unsaved editor state, or {} for a new entry). */
	fields: Record<string, unknown>;
	/** Rewrite just this field instead of filling every empty one. */
	only?: string;
};

export class NothingToWrite extends Error {}

/**
 * Fill an entry from a brief in one generation. Reads the collection schema
 * to decide which fields to write (prose fields that are still empty, or the
 * one field asked for), and suggests tags from the existing `tag` terms.
 */
export async function writeEntry(ctx: PluginContext, settings: WriterSettings, input: WriteInput): Promise<EntryResult> {
	const schema = await ctx.schema?.getCollection(input.collection);
	if (!schema) throw new Error(`Unknown collection: ${input.collection}`);
	const spec = entrySpec(schema);

	const targets = input.only
		? spec.filter((t) => t.field === input.only)
		: spec.filter((t) => !hasValue(input.fields[t.field]));
	if (!targets.length) {
		throw new NothingToWrite(input.only ? `No writable field "${input.only}"` : "Every field already has content");
	}

	const tagTerms = input.only ? [] : await existingTags(ctx, input.collection);

	const messages = buildEntryMessages({
		styleGuide: settings.styleGuide,
		collection: input.collection,
		collectionLabel: schema.labelSingular ?? schema.label,
		collectionDescription: schema.description,
		targets,
		rewrite: Boolean(input.only),
		brief: input.brief,
		fields: input.fields,
		tags: tagTerms.map((t) => t.label),
	});
	const generation = await generate(settings.model, messages, settings.maxTokens);
	const sections = parseSections(generation.text);

	const result: EntryResult = {
		values: {},
		written: [],
		skipped: [],
		dropped: [],
		todos: 0,
		tags: [],
		usage: generation.usage,
		chars: generation.text.length,
	};

	// A single-field answer without a header is still that field.
	if (input.only && !sections.has(input.only) && sections.size === 0) sections.set(input.only, generation.text);

	for (const target of targets) {
		const raw = sections.get(target.field);
		if (!raw?.trim()) {
			result.skipped.push(target.label);
			continue;
		}
		try {
			const { value, dropped } = toFieldValue(raw, target, input.collection);
			result.values[target.field] = value;
			result.written.push(target.label);
			result.dropped.push(...dropped);
		} catch (error) {
			result.skipped.push(`${target.label} (${error instanceof Error ? error.message : error})`);
		}
	}
	if (!result.written.length) {
		throw new Error(
			sections.size ? `Nothing usable in the output (${result.skipped.join("; ")})` : "The model didn't answer in the expected === field === sections",
		);
	}

	result.todos = JSON.stringify(result.values).match(/\[TODO:/g)?.length ?? 0;
	result.tags = matchTags(sections.get("tags") ?? "", tagTerms);
	return result;
}

const HEADER = /^[ \t]*={3,}[ \t]*(?:field:[ \t]*)?([A-Za-z0-9_]+)[ \t]*={3,}[ \t]*$/gm;

/** Split `=== field: slug ===` sections. Text before the first header is ignored. */
export function parseSections(text: string): Map<string, string> {
	let source = text;
	if (!HEADER.test(source)) source = unfence(source);
	HEADER.lastIndex = 0;
	const sections = new Map<string, string>();
	const headers = [...source.matchAll(HEADER)];
	headers.forEach((m, i) => {
		const start = m.index! + m[0].length;
		const end = i + 1 < headers.length ? headers[i + 1].index! : source.length;
		const slug = m[1].toLowerCase();
		if (!sections.has(slug)) sections.set(slug, stripStrayFence(source.slice(start, end).replace(/^\n+|\s+$/g, "")));
	});
	return sections;
}

/**
 * An answer wrapped in one big fence leaves an unpaired fence line at the
 * edge of the first or last section. Real code fences come in pairs.
 */
function stripStrayFence(section: string): string {
	const lines = section.split("\n");
	const fences = lines.filter((l) => /^\s*(`{3,}|~{3,})/.test(l)).length;
	if (fences % 2 === 0) return section;
	if (/^\s*(`{3,}|~{3,})\s*$/.test(lines[lines.length - 1])) lines.pop();
	else if (/^\s*(`{3,}|~{3,})\s*(json|markdown|md|text)?\s*$/i.test(lines[0])) lines.shift();
	return lines.join("\n").trim();
}

/** Turn one section into a value of the target field's type. */
export function toFieldValue(raw: string, target: Target, collection: string): { value: unknown; dropped: string[] } {
	switch (target.kind) {
		case "title":
		case "string":
		case "text": {
			let value = unfence(raw)
				.replace(/^#+\s*/gm, "")
				.replace(/^["“'](.*)["”']$/s, "$1")
				.trim();
			if (target.kind !== "text") value = value.split("\n")[0].trim();
			if (target.kind === "title") value = value.replace(/\.$/, "");
			if (target.max && value.length > target.max) value = value.slice(0, target.max - 1).replace(/\s+\S*$/, "") + "…";
			if (!value) throw new Error("empty");
			return { value, dropped: [] };
		}
		case "portableText": {
			const value = markdownToPortableText(unfence(raw));
			if (!value.length) throw new Error("empty");
			return { value, dropped: [] };
		}
		case "blocks": {
			const allowed = allowedBlockTypes(collection, target.field, target.validation);
			const { blocks, dropped } = normaliseBlocks(raw, allowed, maxBlocks(target.validation));
			if (!blocks.length) throw new Error(dropped.length ? dropped.join("; ") : "no blocks");
			return { value: blocks, dropped };
		}
	}
}

type Term = { slug: string; label: string };

async function existingTags(ctx: PluginContext, collection: string): Promise<Term[]> {
	try {
		const taxonomies = await ctx.taxonomies?.getAll();
		if (!taxonomies?.some((t) => t.name === "tag" && t.collections.includes(collection))) return [];
		return (await ctx.taxonomies!.getTerms("tag")).map((t) => ({ slug: t.slug, label: t.label }));
	} catch (error) {
		ctx.log.warn(`ai-writer: could not read tags: ${error instanceof Error ? error.message : error}`);
		return [];
	}
}

/** Keep only suggestions that name an existing term (by label or slug). */
export function matchTags(raw: string, terms: Term[]): string[] {
	const norm = (s: string) => s.toLowerCase().replace(/[`*_#]/g, "").trim();
	const out = new Set<string>();
	for (const part of raw.split(/[,\n]/)) {
		const want = norm(part.replace(/^[-•]\s*/, ""));
		const term = terms.find((t) => norm(t.label) === want || norm(t.slug) === want);
		if (term) out.add(term.label);
	}
	return [...out].slice(0, 4);
}

export function hasValue(value: unknown): boolean {
	return Array.isArray(value) ? value.length > 0 : typeof value === "string" ? value.trim() !== "" : value != null;
}
