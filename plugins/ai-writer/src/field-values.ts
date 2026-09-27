/**
 * Turning what the model writes into stored field values: plain text with
 * length caps, Markdown to Portable Text, JSON to validated blocks. Used by
 * the WriterAgent's set_field and suggest_tags tools.
 */
import { allowedBlockTypes, maxBlocks, normaliseBlocks, unfence } from "./blocks";
import type { Target } from "./entry-spec";
import { markdownToPortableText } from "./markdown-to-pt";

/** Convert one model-written value into the target field's stored type. Throws on empty or invalid values. */
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
