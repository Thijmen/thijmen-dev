import type { Target } from "./entry-spec";
import { portableTextToMarkdown } from "./markdown-to-pt";

/** Default for the `styleGuide` setting. Condensed from CLAUDE.md's voice rules. */
export const DEFAULT_STYLE_GUIDE = `You write for thijmen.dev, the personal site of Thijmen Stavenuiter, a Staff Engineer. Write in the first person, as Thijmen.

Voice: an engineer's terminal. Dry, specific, concrete. Short declarative sentences. Real nouns: systems, failure modes, numbers, trade-offs. Understatement over hype. Mild dry humour is fine; jokes are not.

Never write generic copy ("Welcome to my blog", "In today's fast-paced world", "Let's dive in", "In conclusion"). No marketing adjectives (seamless, robust, cutting-edge, game-changing). No emoji. No exclamation marks.

Titles: sentence case, and wrap exactly one short phrase in *asterisks* for the italic accent, e.g. "Idempotency keys are a *contract*, not a header".

Headings in a body are plain statements of what the section says, not questions or puns. Prefer prose over bullet lists; use a list only for real enumerations. Use code blocks for code, commands and config, with the language on the fence.`;

export const FORMAT: Record<Target["kind"], string> = {
	title: "one line of plain text, no quotes, no trailing period",
	string: "one line of plain text, no markdown",
	text: "plain prose, no markdown, no headings",
	portableText:
		"Markdown. ## for sections, ### for sub-sections, never #. > for a single callout note. Fenced code blocks carry a language, optionally followed by a filename (```kotlin OrderService.kt). Links only to URLs you were given. No title, no closing summary section",
	blocks: "a JSON array of blocks, passed as a string; the allowed types are listed under blockTypes",
};

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

