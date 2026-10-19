/**
 * Write an entry's fields in one model call: build the prompt, parse the
 * `=== field ===` sections, and turn each into the stored value of its
 * field type. Pure apart from the one `complete()` call, so the parsing is
 * unit-tested directly.
 */
import type { PluginContext } from "emdash/plugin";

import type { Config } from "./config";
import { hasValue, type Target } from "./fields";
import { markdownToPortableText } from "./markdown";
import { complete, type Usage } from "./model-client";
import { buildEntryMessages, type EntryPrompt } from "./prompt";

export type Terms = { taxonomy: string; label: string; terms: Array<{ id: string; slug: string; label: string }> };

export type WriteInput = {
	collection: string;
	collectionLabel: string;
	collectionDescription: string | null;
	/** Every writable field of the collection. */
	targets: Target[];
	brief: string;
	/** Current values (empty for a new entry). */
	fields: Record<string, unknown>;
	labels: Record<string, string>;
	/** Rewrite just this field instead of filling every empty one. */
	only?: string;
	terms: Terms | null;
	model: string;
};

export type EntryResult = {
	/** Field values ready for content.create / update. */
	values: Record<string, unknown>;
	/** Labels of the fields that got a value, in order. */
	written: string[];
	/** Labels of the fields the model left out or wrote unusably. */
	skipped: string[];
	todos: number;
	/** Suggested existing terms (labels). */
	terms: string[];
	usage: Usage | null;
	ms: number;
};

export class NothingToWrite extends Error {}

/** The targets one run writes: the one asked for, or every empty one. */
export function pickTargets(targets: Target[], fields: Record<string, unknown>, only?: string): Target[] {
	if (only) {
		const target = targets.filter((t) => t.field === only);
		if (!target.length) throw new NothingToWrite(`"${only}" isn't a field the writer can fill`);
		return target;
	}
	const empty = targets.filter((t) => !hasValue(fields[t.field]));
	if (!empty.length) throw new NothingToWrite("Every field the writer can fill already has content");
	return empty;
}

export async function writeEntry(ctx: PluginContext, config: Config, input: WriteInput): Promise<EntryResult> {
	const targets = pickTargets(input.targets, input.fields, input.only);
	const prompt: EntryPrompt = {
		site: { name: ctx.site.name, url: ctx.site.url, locale: ctx.site.locale },
		styleGuide: config.styleGuide,
		about: config.about,
		collection: input.collection,
		collectionLabel: input.collectionLabel,
		collectionDescription: input.collectionDescription,
		targets,
		rewrite: Boolean(input.only),
		brief: input.brief,
		fields: input.fields,
		labels: input.labels,
		terms: !input.only && input.terms?.terms.length ? { taxonomy: input.terms.label.toLowerCase(), labels: input.terms.terms.map((t) => t.label) } : null,
	};
	const completion = await complete(ctx, config, input.model, buildEntryMessages(prompt), config.maxTokens);
	return { ...parseEntry(completion.text, targets, input.only, input.terms), usage: completion.usage, ms: completion.ms };
}

/** Turn the model's answer into field values. Throws when nothing usable came back. */
export function parseEntry(text: string, targets: Target[], only?: string, terms?: Terms | null): Omit<EntryResult, "usage" | "ms"> {
	const sections = parseSections(text);
	// A single-field answer without a header is still that field.
	if (only && sections.size === 0) sections.set(only, text);

	const result: Omit<EntryResult, "usage" | "ms"> = { values: {}, written: [], skipped: [], todos: 0, terms: [] };
	for (const target of targets) {
		const raw = sections.get(target.field.toLowerCase());
		if (!raw?.trim()) {
			result.skipped.push(target.label);
			continue;
		}
		try {
			result.values[target.field] = toFieldValue(raw, target);
			result.written.push(target.label);
		} catch (error) {
			result.skipped.push(`${target.label} (${error instanceof Error ? error.message : error})`);
		}
	}
	if (!result.written.length) {
		throw new Error(
			sections.size ? `Nothing usable in the answer (${result.skipped.join("; ")})` : "The model didn't answer in the expected === field === sections. Try again, or pick another model.",
		);
	}
	result.todos = countTodos(result.values);
	result.terms = terms ? matchTerms(sections.get("terms") ?? sections.get("tags") ?? "", terms.terms) : [];
	return result;
}

export function countTodos(values: Record<string, unknown>): number {
	return JSON.stringify(values).match(/\[TODO:/g)?.length ?? 0;
}

const HEADER = /^[ \t]*={3,}[ \t]*(?:field:[ \t]*)?([A-Za-z0-9_]+)[ \t]*={3,}[ \t]*$/gm;

/** Split `=== field: slug ===` sections. Text before the first header is ignored. */
export function parseSections(text: string): Map<string, string> {
	let source = text;
	HEADER.lastIndex = 0;
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
 * Strip one wrapping ```markdown / ```text fence, which models add to "only
 * the answer" replies anyway. A fence with a code language is real content.
 */
export function unfence(text: string): string {
	const m = /^\s*(`{3,}|~{3,})\s*(?:json|markdown|md|text)?\s*\n([\s\S]*?)\n\s*\1\s*$/i.exec(text);
	return m ? m[2] : text.trim();
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

/** One section as the stored value of its field type. Throws on an empty result. */
export function toFieldValue(raw: string, target: Target): unknown {
	if (target.kind === "portableText") {
		const value = markdownToPortableText(unfence(raw));
		if (!value.length) throw new Error("empty");
		return value;
	}
	let value = unfence(raw)
		.replace(/^#+\s*/gm, "")
		.replace(/^["“'](.*)["”']$/s, "$1")
		.trim();
	if (target.kind !== "text") value = value.split("\n")[0].trim();
	if (target.kind === "title") value = value.replace(/\.$/, "");
	if (target.kind !== "text") value = value.replace(/\*\*(.+?)\*\*/g, "$1");
	if (target.max && value.length > target.max) value = value.slice(0, target.max - 1).replace(/\s+\S*$/, "") + "…";
	if (!value) throw new Error("empty");
	return value;
}

/** Keep only suggestions that name an existing term (by label or slug). */
export function matchTerms(raw: string, terms: Array<{ slug: string; label: string }>): string[] {
	const norm = (s: string) => s.toLowerCase().replace(/[`*_#]/g, "").trim();
	const out = new Set<string>();
	for (const part of raw.split(/[,\n]/)) {
		const want = norm(part.replace(/^[-•]\s*/, ""));
		const term = terms.find((t) => norm(t.label) === want || norm(t.slug) === want);
		if (term) out.add(term.label);
	}
	return [...out].slice(0, 4);
}
