/**
 * Which fields of an entry the writer may fill, from the live collection
 * schema. Prose only: plain strings, long text and Portable Text. Dates,
 * media, links, selects, numbers, references and blocks are facts or
 * structure the model can't know, so they never appear here. Strings whose
 * name says they hold an identifier (url, email, sku, version, …) are skipped
 * too, as is anything the site lists under "Fields to skip".
 */
import type { CollectionSchemaInfo, FieldSchemaInfo } from "./types";

export type TargetKind = "title" | "string" | "text" | "portableText";

export type Target = {
	field: string;
	label: string;
	kind: TargetKind;
	purpose: string;
	/** Hard length cap for plain-text kinds. */
	max?: number;
};

const KIND: Partial<Record<string, TargetKind>> = { string: "string", text: "text", portableText: "portableText" };
const ORDER: Record<TargetKind, number> = { title: 0, string: 1, text: 2, portableText: 3 };

/** Slug words that mark an identifier or a fact, not prose. */
const FACTUAL =
	/(^|_)(url|uri|href|link|email|mail|phone|tel|sku|isbn|ean|gtin|price|cost|amount|currency|version|lang|language|locale|icon|colou?r|hex|token|id|uuid|hash|path|slug|handle|username|domain|host|ip|code|zip|postcode|postal|address|lat|lng|latitude|longitude|install|command|repo|stars|count|status)($|_)/i;

/** Purposes for common field names, so the model writes to what the field is for. */
const PURPOSES: Array<[RegExp, string, number?]> = [
	[/^(excerpt|summary|teaser|abstract|dek|intro|introduction|blurb)$/i, "Short summary shown on cards and in listings. One or two sentences that state the point, no teaser phrasing.", 300],
	[/^(subtitle|subheading|sub_title|tagline|lede|lead|standfirst|deck|strapline)$/i, "A short line that goes with the title and adds to it.", 200],
	[/^(kicker|eyebrow|overline|label)$/i, "A few words shown above the title.", 60],
	[/^(caption|cover_caption|image_caption|featured_image_caption)$/i, "Caption for the image. Only if the brief says what the image shows; otherwise leave it out.", 160],
	[/^(meta_description|seo_description|description)$/i, "Description for search results and link previews, at most 155 characters.", 160],
	[/^(content|body|text|article|post_body|main)$/i, "The main body: the substance of the entry, with ## sections and examples where they help."],
];

type Options = { skip?: string[] };

export function writableTargets(schema: CollectionSchemaInfo, options: Options = {}): Target[] {
	const titleField = schema.titleField ?? (schema.fields.some((f) => f.slug === "title") ? "title" : null);
	const skip = new Set((options.skip ?? []).map((s) => s.toLowerCase()));
	const skipped = (slug: string) => skip.has(slug.toLowerCase()) || skip.has(`${schema.slug}.${slug}`.toLowerCase());

	// SEO fields (`seo.description`) stay out: EmDash 1.3's sandbox bridge passes
	// updates straight to the content table, which has no `seo` column.
	return schema.fields
		.filter((f) => isProse(f, f.slug === titleField) && !skipped(f.slug))
		.map((f) => toTarget(f, f.slug === titleField))
		.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

function isProse(f: FieldSchemaInfo, isTitle: boolean): boolean {
	if (!KIND[f.type]) return false;
	if (isTitle) return true;
	// A custom widget means a structured value (colour picker, code editor, …).
	if (f.widget) return false;
	// Identifiers and codes are usually marked non-translatable.
	if (f.translatable === false) return false;
	if (f.type !== "portableText" && FACTUAL.test(f.slug)) return false;
	// A pattern on a string field means it holds a format, not prose.
	if (f.validation?.pattern) return false;
	return true;
}

function toTarget(f: FieldSchemaInfo, isTitle: boolean): Target {
	const kind: TargetKind = isTitle ? "title" : KIND[f.type]!;
	const known = PURPOSES.find(([re]) => re.test(f.slug));
	const limit = f.validation?.maxLength;
	const fallbackMax = kind === "title" ? 120 : kind === "string" ? 200 : kind === "text" ? 1200 : undefined;
	const max = Math.min(limit ?? Infinity, known?.[2] ?? fallbackMax ?? Infinity);
	return {
		field: f.slug,
		label: f.label,
		kind,
		purpose: isTitle ? "The entry's title: one specific phrase that says what it's about." : (known?.[1] ?? `${f.label}.`),
		...(Number.isFinite(max) ? { max } : {}),
	};
}

/** True when a stored value counts as written. */
export function hasValue(value: unknown): boolean {
	if (Array.isArray(value)) return value.length > 0;
	if (typeof value === "string") return value.trim() !== "";
	return value != null;
}

/** Required fields the writer doesn't fill and EmDash can't default: the entry can't be created without them. */
export function unfillableRequired(schema: CollectionSchemaInfo, targets: Target[]): FieldSchemaInfo[] {
	const written = new Set(targets.map((t) => t.field));
	return schema.fields.filter((f) => f.required && !written.has(f.slug) && f.default === undefined && f.type !== "datetime" && f.type !== "boolean");
}

/** Values for required fields that have an honest default: now for dates, false for flags. */
export function requiredDefaults(schema: CollectionSchemaInfo, targets: Target[]): Record<string, unknown> {
	const written = new Set(targets.map((t) => t.field));
	const out: Record<string, unknown> = {};
	for (const f of schema.fields) {
		if (!f.required || written.has(f.slug) || f.default !== undefined) continue;
		if (f.type === "datetime") out[f.slug] = new Date().toISOString();
		else if (f.type === "boolean") out[f.slug] = false;
	}
	return out;
}
