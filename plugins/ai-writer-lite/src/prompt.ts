import type { Target } from "./fields";
import { portableTextToMarkdown } from "./markdown";
import type { ChatMessage } from "./types";

const GUARDRAIL = `Hard rule: never invent facts about the author, the site, or anything a reader could check: names, employers, roles, dates, numbers, metrics, customers, incidents, quotes, links, prices and version numbers. Use only what the brief, the facts below and the current entry give you. Where the text needs such a fact and you don't have it, write a visible placeholder like [TODO: which payment provider] in its place and carry on.`;

export const FORMAT: Record<Target["kind"], string> = {
	title: "one line of plain text, no quotes, no trailing period",
	string: "one line of plain text, no markdown",
	text: "plain prose, no markdown, no headings",
	portableText:
		"Markdown. ## for sections, ### for sub-sections, never #. > for a callout. Fenced code blocks carry a language. GitHub pipe tables only for real tabular data. Links only to URLs you were given. No title, no closing summary section",
};

export type EntryPrompt = {
	site: { name: string; url: string; locale: string };
	styleGuide: string;
	about: string;
	collection: string;
	collectionLabel: string;
	collectionDescription: string | null;
	/** Fields to write, in output order. */
	targets: Target[];
	/** Set when one field is rewritten rather than the empty ones filled. */
	rewrite?: boolean;
	brief: string;
	/** Current values of the entry, keyed by field. */
	fields: Record<string, unknown>;
	/** Labels of fields that exist but the writer doesn't touch, keyed by slug, for context. */
	labels: Record<string, string>;
	/** Existing terms the model may pick from; empty to skip. */
	terms: { taxonomy: string; labels: string[] } | null;
};

/**
 * One prompt for the whole entry. The answer comes back as delimited
 * sections (`=== field: slug ===`), so a long Markdown body never has to be
 * escaped inside JSON.
 */
export function buildEntryMessages(p: EntryPrompt): ChatMessage[] {
	const fieldSpecs = p.targets
		.map((t) => `=== field: ${t.field} ===\n${t.label}. ${t.purpose}\nFormat: ${FORMAT[t.kind]}${t.max ? `, at most ${t.max} characters` : ""}.`)
		.join("\n\n");

	const termRule = p.terms?.labels.length
		? `\n\nFinish with a last section \`=== terms ===\` listing up to 4 ${p.terms.taxonomy} for this entry, comma-separated, chosen only from: ${p.terms.labels.join(", ")}.`
		: "";

	const siteLine = [`The site: ${p.site.name || "(unnamed)"}${p.site.url ? ` (${p.site.url})` : ""}.`, `Write in the language of the brief; with no brief, in the language of the current entry; otherwise in the site's language (${p.site.locale}).`].join(" ");

	const system = [
		p.styleGuide.trim(),
		GUARDRAIL,
		siteLine,
		p.about.trim() && `Facts about the author and the site you may use:\n${p.about.trim()}`,
		`You are filling in a ${p.collectionLabel.toLowerCase()} entry (collection \`${p.collection}\`)${p.collectionDescription ? `: ${p.collectionDescription}` : ""}. The fields to write, in order:`,
		fieldSpecs,
		`Answer with exactly these sections, in this order, each starting with its === line on its own. Leave a section empty when its field says to leave it out. Write nothing before the first section. The fields must agree with each other: the title and short fields follow from the body.${termRule}`,
	]
		.filter(Boolean)
		.join("\n\n");

	const writing = new Set(p.targets.map((t) => t.field));
	const context = Object.entries(p.fields)
		.filter(([slug, value]) => (p.rewrite || !writing.has(slug)) && formatValue(value))
		.map(([slug, value]) => `### ${p.labels[slug] ?? slug} (${slug})\n${clip(formatValue(value), 8000)}`)
		.join("\n\n");

	const brief = p.brief.trim();
	const task = p.rewrite
		? `Rewrite the ${p.targets[0].label.toLowerCase()} (\`${p.targets[0].field}\`). Keep every fact and [TODO] in it. ${brief ? `Change what this asks:\n${brief}` : "Make it clearer and tighter."}`
		: brief
			? `Brief:\n${brief}`
			: "No brief: write the missing fields from what the entry already says.";

	const user = [task, context && `${p.rewrite ? "The entry as it is now" : "Already written, keep and build on it (don't repeat it)"}:\n\n${context}`]
		.filter(Boolean)
		.join("\n\n---\n\n");

	return [
		{ role: "system", content: system },
		{ role: "user", content: user },
	];
}

function clip(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** A field value as the model reads it: Portable Text as Markdown, other structures as JSON. */
export function formatValue(value: unknown): string {
	if (value === null || value === undefined || value === "") return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value) && value.some((n) => n && typeof n === "object" && (n._type === "block" || n._type === "code" || n._type === "table"))) {
		return portableTextToMarkdown(value);
	}
	// Images, files and references carry ids, not prose.
	if (typeof value === "object" && ("src" in (value as object) || "id" in (value as object))) return "";
	return JSON.stringify(value).slice(0, 2000);
}
