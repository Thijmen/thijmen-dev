import type { ChatMessage } from "./ai";
import { allowedBlockTypes, describeBlockTypes, maxBlocks } from "./blocks";
import type { Target } from "./entry-spec";
import { portableTextToMarkdown } from "./markdown-to-pt";

/** Default for the `styleGuide` setting. Condensed from CLAUDE.md's voice rules. */
export const DEFAULT_STYLE_GUIDE = `You write for thijmen.dev, the personal site of Thijmen Stavenuiter, a Staff Engineer. Write in the first person, as Thijmen.

Voice: an engineer's terminal. Dry, specific, concrete. Short declarative sentences. Real nouns: systems, failure modes, numbers, trade-offs. Understatement over hype. Mild dry humour is fine; jokes are not.

Never write generic copy ("Welcome to my blog", "In today's fast-paced world", "Let's dive in", "In conclusion"). No marketing adjectives (seamless, robust, cutting-edge, game-changing). No emoji. No exclamation marks.

Titles: sentence case, and wrap exactly one short phrase in *asterisks* for the italic accent, e.g. "Idempotency keys are a *contract*, not a header".

Headings in a body are plain statements of what the section says, not questions or puns. Prefer prose over bullet lists; use a list only for real enumerations. Use code blocks for code, commands and config, with the language on the fence.`;

const GUARDRAIL = `Hard rule: never invent facts about Thijmen or anything checkable. That includes employers, roles, dates, team sizes, metrics, incidents, project names, quotes, links and version numbers. If the text needs such a fact and neither the brief nor the current entry gives it, write a visible placeholder like [TODO: which payment provider] in its place and carry on.`;

const FORMAT: Record<Target["kind"], string> = {
	title: "one line of plain text, no quotes, no trailing period",
	string: "one line of plain text, no markdown",
	text: "plain prose, no markdown, no headings",
	portableText:
		"Markdown. ## for sections, ### for sub-sections, never #. > for a single callout note. Fenced code blocks carry a language, optionally followed by a filename (```kotlin OrderService.kt). Links only to URLs you were given. No title, no closing summary section",
	blocks: "a JSON array of blocks (no prose around it); see the block types below",
};

type EntryPrompt = {
	styleGuide: string;
	collection: string;
	collectionLabel: string;
	collectionDescription: string | null;
	/** Fields to write, in output order. */
	targets: Target[];
	/** Set when one field is rewritten rather than the empty ones filled. */
	rewrite?: boolean;
	brief: string;
	/** Current values of every readable field (unsaved editor state). */
	fields: Record<string, unknown>;
	/** Existing tag labels the model may pick from; empty to skip tags. */
	tags: string[];
};

/**
 * One prompt for the whole entry. The answer comes back as delimited
 * sections (`=== field: slug ===`), so a long Markdown body never has to be
 * escaped inside JSON.
 */
export function buildEntryMessages(p: EntryPrompt): ChatMessage[] {
	const fieldSpecs = p.targets
		.map((t) => {
			const cap = t.max ? `, at most ${t.max} characters` : "";
			let spec = `=== field: ${t.field} ===\n${t.label}. ${t.purpose}\nFormat: ${FORMAT[t.kind]}${cap}.`;
			if (t.kind === "blocks") {
				const allowed = allowedBlockTypes(p.collection, t.field, t.validation);
				spec += `\nAt most ${maxBlocks(t.validation)} blocks. Each block is an object with "_type" and its fields; omit optional fields you have nothing for. "markdown string" fields take Markdown as described for bodies. Data blocks (post/project lists, history, now playing) only store filters; include them only when they fit the page. Allowed block types:\n${describeBlockTypes(allowed)}`;
			}
			return spec;
		})
		.join("\n\n");

	const tagRule = p.tags.length
		? `\n\nFinish with a last section \`=== tags ===\` listing up to 4 tags for this entry, comma-separated, chosen only from: ${p.tags.join(", ")}.`
		: "";

	const system = [
		p.styleGuide.trim(),
		GUARDRAIL,
		`You are filling in a ${p.collectionLabel.toLowerCase()} entry (collection \`${p.collection}\`)${p.collectionDescription ? `: ${p.collectionDescription}` : ""}. The fields to write, in order:`,
		fieldSpecs,
		`Answer with exactly these sections, in this order, each starting with its === line on its own. Leave a section empty when its field says to leave it out. Write nothing before the first section. The fields must agree with each other: the title, short fields and blocks all follow from the body.${tagRule}`,
	].join("\n\n");

	const writing = new Set(p.targets.map((t) => t.field));
	const context = Object.entries(p.fields)
		.filter(([slug, value]) => (p.rewrite || !writing.has(slug)) && formatValue(value))
		.map(([slug, value]) => `### ${slug}\n${formatValue(value)}`)
		.join("\n\n");

	const task = p.rewrite
		? `Rewrite the ${p.targets[0].label.toLowerCase()} (\`${p.targets[0].field}\`). Keep every fact and [TODO] in it; change what this asks:\n${p.brief}`
		: `Brief:\n${p.brief}`;

	const user = [
		task,
		context &&
			`${p.rewrite ? "The entry as it is now" : "Already written, keep and build on it (don't repeat it)"}:\n\n${context}`,
	]
		.filter(Boolean)
		.join("\n\n---\n\n");

	return [
		{ role: "system", content: system },
		{ role: "user", content: user },
	];
}

/** A field value as the model reads and writes it: PT as Markdown, blocks as JSON. */
export function formatValue(value: unknown): string {
	if (value === null || value === undefined || value === "") return "";
	if (typeof value === "string") return value;
	if (Array.isArray(value)) {
		if (value.some((v) => v && typeof v === "object" && "_version" in v)) {
			return JSON.stringify(value.map(stripBlockMeta), null, 1);
		}
		return portableTextToMarkdown(value);
	}
	return JSON.stringify(value);
}

/** Blocks go back to the model in the shape it writes: no keys, PT as markdown. */
function stripBlockMeta(block: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(block)) {
		if (k === "_key" || k === "_version") continue;
		out[k] = Array.isArray(v) && v.some((n) => n?._type === "block" || n?._type === "code") ? portableTextToMarkdown(v) : v;
	}
	return out;
}

