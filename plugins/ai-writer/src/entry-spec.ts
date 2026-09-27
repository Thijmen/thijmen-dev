/**
 * What the writer may fill in an entry, derived from the live collection
 * schema (`ctx.schema`) plus what this site uses each field for. Prose types
 * only: dates, media, URLs, selects, flags and numbers are facts the model
 * can't know, so they never appear here.
 */

export type TargetKind = "title" | "string" | "text" | "portableText" | "blocks";
export type Target = {
	field: string;
	label: string;
	kind: TargetKind;
	purpose: string;
	/** Hard length cap for plain-text kinds. */
	max?: number;
	validation?: unknown;
};

type SchemaField = { slug: string; label: string; type: string; validation?: unknown };
type SchemaCollection = { slug: string; label: string; description: string | null; titleField: string | null; fields: SchemaField[] };

/** Prose fields the writer may fill, across posts, projects and pages. Add a new prose field here too. */
export const WRITABLE_FIELDS = ["title", "kicker", "excerpt", "summary", "lede", "description", "cover_caption", "content", "sections", "body"];

// Factual strings: the brief may mention them, but the model mustn't guess them.
const DENY = new Set(["language", "install", "stars"]);

/** How this site uses each field, so the model writes to its purpose. Unknown fields fall back to their label. */
const PURPOSE: Record<string, { purpose: string; max?: number }> = {
	title: { purpose: "Display title (the page h1). Sentence case, exactly one short phrase wrapped in *asterisks* for the italic accent.", max: 110 },
	kicker: { purpose: "Mono kicker line above the title, in terminal voice, e.g. `$ cat now.md`.", max: 60 },
	excerpt: { purpose: "Shown on post cards and as the meta description. One or two sentences that state the point, no teaser phrasing.", max: 300 },
	summary: { purpose: "Project card description: what it does and why it exists, one or two sentences.", max: 300 },
	lede: { purpose: "Lede under the page title: one or two sentences.", max: 300 },
	description: { purpose: "SEO meta description, at most 155 characters.", max: 160 },
	cover_caption: { purpose: "Caption under the cover image, mono, short. Only if the brief implies what the image shows; otherwise leave it out.", max: 140 },
	content: { purpose: "The post body. The core of the entry: the argument, with ## sections, examples and code where they help." },
	sections: { purpose: "Blocks shown after the body: related posts, FAQ, call to action. Two or three at most, only ones that earn their place." },
	body: { purpose: "The entry's main content as a sequence of blocks. Prose blocks carry the text; use terminal, note, links, faq where they fit." },
};

const KIND: Record<string, TargetKind> = { string: "string", text: "text", portableText: "portableText", blocks: "blocks" };
const ORDER: Record<TargetKind, number> = { title: 0, string: 1, text: 2, portableText: 3, blocks: 4 };

export function entrySpec(schema: SchemaCollection): Target[] {
	const titleField = schema.titleField ?? "title";
	const allowed = new Set(WRITABLE_FIELDS);
	return schema.fields
		.filter((f) => KIND[f.type] && !DENY.has(f.slug) && allowed.has(f.slug))
		.map((f): Target => {
			const known = PURPOSE[f.slug];
			return {
				field: f.slug,
				label: f.label,
				kind: f.slug === titleField ? "title" : KIND[f.type],
				purpose: known?.purpose ?? f.label,
				...(known?.max ? { max: known.max } : f.type === "string" ? { max: 200 } : f.type === "text" ? { max: 1200 } : {}),
				...(f.validation ? { validation: f.validation } : {}),
			};
		})
		.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}
