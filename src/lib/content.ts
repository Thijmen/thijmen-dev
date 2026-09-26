import { getEmDashEntry } from "emdash";

type Block = {
	_type?: string;
	style?: string;
	children?: Array<{ text?: string }>;
	code?: string;
};

/** Plain text of a Portable Text block (spans joined). */
export function blockText(block: Block): string {
	return (block.children ?? []).map((c) => c.text ?? "").join("");
}

/** URL-safe id for a heading. Shared by the TOC and the h2 renderer. */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/** h2 headings of a Portable Text body, for the post's table of contents. */
export function extractHeadings(pt: unknown): Array<{ id: string; text: string }> {
	if (!Array.isArray(pt)) return [];
	return (pt as Block[])
		.filter((b) => b._type === "block" && b.style === "h2")
		.map((b) => {
			const text = blockText(b);
			return { id: slugify(text), text };
		});
}

/** Estimated reading time in minutes (~220 wpm, code counted too). */
export function readingTime(pt: unknown): number {
	if (!Array.isArray(pt)) return 1;
	const words = (pt as Block[])
		.map((b) => (b._type === "code" ? (b.code ?? "") : blockText(b)))
		.join(" ")
		.split(/\s+/)
		.filter(Boolean).length;
	return Math.max(1, Math.round(words / 220));
}

/** ISO-style date (2026-07-18), the format used across the site. */
export function formatDate(date: unknown): string {
	if (!date) return "";
	const d = date instanceof Date ? date : new Date(String(date));
	return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Placeholder filename shown on posts without a cover image. */
export function placeholderName(slug: string): string {
	return `${slug.slice(0, 28).replace(/-$/, "")}.png`;
}

/** The single `profile` entry (slug "me") that holds site-wide copy. */
export async function getProfile() {
	const { entry, cacheHint } = await getEmDashEntry("profile", "me");
	return { profile: entry?.data, cacheHint };
}

type Term = { slug: string; label: string };

/** What every post card needs, derived once from a `posts` entry. */
export interface PostSummary {
	slug: string;
	url: string;
	title: string;
	excerpt: string;
	date: string;
	tags: Term[];
	tag: string;
	readMin: number;
	image: unknown;
}

export function toPostSummary(entry: { id: string; data: Record<string, any> }): PostSummary {
	const tags: Term[] = entry.data.terms?.tag ?? [];
	return {
		slug: entry.id,
		url: `/blog/${entry.id}`,
		title: plainTitle(entry.data.title) || "Untitled",
		excerpt: entry.data.excerpt ?? "",
		date: formatDate(entry.data.date ?? entry.data.publishedAt),
		tags,
		tag: tags[0]?.slug ?? "",
		readMin: readingTime(entry.data.content),
		image: hasImage(entry.data.featured_image) ? entry.data.featured_image : null,
	};
}

/** A project's case-study URL, when its `body` has blocks. */
export function projectHref(entry: { id: string; data: Record<string, any> }): string | undefined {
	return Array.isArray(entry.data.body) && entry.data.body.length > 0 ? `/projects/${entry.id}` : undefined;
}

/** True when an image field actually points at media (not an empty object). */
export function hasImage(img: unknown): boolean {
	if (!img || typeof img !== "object") return false;
	const v = img as { id?: string; src?: string };
	return Boolean(v.src || v.id);
}

/**
 * Escape plain CMS text and turn `*phrase*` into <em>phrase</em>, so
 * editors can mark the italic accent in headings ("Writing *from production.*").
 */
export function emphasize(text: unknown): string {
	return String(text ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

/** A json field that should hold an array; anything else becomes []. */
export function asArray<T = unknown>(v: unknown): T[] {
	return Array.isArray(v) ? (v as T[]) : [];
}

/** A title with its `*emphasis*` markers removed, for cards and meta. */
export function plainTitle(text: unknown): string {
	return String(text ?? "").replace(/\*([^*]+)\*/g, "$1");
}
