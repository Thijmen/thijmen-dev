import { describe, expect, it } from "vitest";

import { requiredDefaults, unfillableRequired, writableTargets } from "../src/fields";
import { markdownToPortableText, portableTextToMarkdown } from "../src/markdown";
import { describeError } from "../src/model-client";
import { buildEntryMessages } from "../src/prompt";
import type { CollectionSchemaInfo, FieldSchemaInfo } from "../src/types";
import { matchTerms, parseEntry, parseSections, pickTargets, toFieldValue } from "../src/writer";

function field(slug: string, type: FieldSchemaInfo["type"], extra: Partial<FieldSchemaInfo> = {}): FieldSchemaInfo {
	return { slug, label: slug.replace(/_/g, " "), type, required: false, unique: false, searchable: false, indexed: false, translatable: true, sortOrder: 0, ...extra };
}

function collection(fields: FieldSchemaInfo[], extra: Partial<CollectionSchemaInfo> = {}): CollectionSchemaInfo {
	return {
		slug: "posts",
		label: "Posts",
		labelSingular: "Post",
		description: null,
		supports: ["drafts", "revisions"],
		hasSeo: false,
		titleField: "title",
		dateField: null,
		urlPattern: null,
		routable: true,
		hidden: false,
		fields,
		...extra,
	};
}

const posts = collection([
	field("title", "string", { required: true }),
	field("excerpt", "text"),
	field("content", "portableText"),
	field("date", "datetime", { required: true }),
	field("cover", "image"),
	field("source_url", "string"),
	field("sku", "string"),
	field("accent", "string", { widget: "color:picker" }),
	field("code_name", "string", { translatable: false }),
	field("subtitle", "string", { validation: { maxLength: 80 } }),
]);

describe("writableTargets", () => {
	it("keeps prose fields and skips facts, media and identifiers", () => {
		const targets = writableTargets(posts);
		expect(targets.map((t) => t.field)).toEqual(["title", "subtitle", "excerpt", "content"]);
		expect(targets[0].kind).toBe("title");
		expect(targets.find((t) => t.field === "subtitle")?.max).toBe(80);
		expect(targets.find((t) => t.field === "excerpt")?.purpose).toMatch(/summary/i);
	});

	it("honours the skip list, by slug or collection.slug", () => {
		expect(writableTargets(posts, { skip: ["subtitle", "posts.excerpt"] }).map((t) => t.field)).toEqual(["title", "content"]);
	});

	it("leaves SEO fields alone", () => {
		expect(writableTargets(collection([field("title", "string")], { hasSeo: true })).map((t) => t.field)).toEqual(["title"]);
	});

	it("reports required fields it can't fill, and defaults the ones it can", () => {
		const shop = collection([field("title", "string"), field("price", "number", { required: true }), field("date", "datetime", { required: true })]);
		const targets = writableTargets(shop);
		expect(unfillableRequired(shop, targets).map((f) => f.slug)).toEqual(["price"]);
		expect(Object.keys(requiredDefaults(shop, targets))).toEqual(["date"]);
	});
});

describe("markdown", () => {
	it("round-trips headings, lists, code, tables and marks", () => {
		const md = [
			"## Why retries need keys",
			"A **bold** claim with `code` and a [link](https://example.com).",
			"- one\n- two",
			"```ts client.ts\nconst x = 1;\n```",
			"| a | b |\n| --- | ---: |\n| 1 | 2 |",
			"> A note.",
		].join("\n\n");
		const pt = markdownToPortableText(md);
		expect(pt.map((n) => (n._type === "block" ? (n.listItem ?? n.style) : n._type))).toEqual(["h2", "normal", "bullet", "bullet", "code", "table", "blockquote"]);
		const code = pt.find((n) => n._type === "code");
		expect(code).toMatchObject({ language: "ts", filename: "client.ts", code: "const x = 1;" });
		expect(portableTextToMarkdown(pt)).toBe(md.replace("| --- | ---: |", "| --- | ---: |"));
	});
});

describe("parsing the answer", () => {
	const targets = writableTargets(posts);
	const answer = `Here you go.
=== field: title ===
"Retries are a *contract*."
=== field: subtitle ===
**What the client and server owe each other when a request repeats, and why the key is part of the API rather than a header detail.**
=== field: excerpt ===
Idempotency keys make retries safe. [TODO: which payment provider]
=== field: content ===
\`\`\`markdown
## The problem

Requests fail halfway.
\`\`\`
=== terms ===
APIs, reliability, Nonsense`;

	it("splits sections and converts each to its field type", () => {
		const sections = parseSections(answer);
		expect([...sections.keys()]).toEqual(["title", "subtitle", "excerpt", "content", "terms"]);
		const result = parseEntry(answer, targets, undefined, {
			taxonomy: "tag",
			label: "Tags",
			terms: [
				{ id: "1", slug: "apis", label: "APIs" },
				{ id: "2", slug: "reliability", label: "Reliability" },
			],
		});
		expect(result.values.title).toBe("Retries are a *contract*");
		// 80-character cap from the field's validation, cut on a word.
		expect(String(result.values.subtitle).length).toBeLessThanOrEqual(80);
		expect(String(result.values.subtitle)).not.toContain("**");
		expect(result.values.content).toMatchObject([{ style: "h2" }, { style: "normal" }]);
		expect(result.todos).toBe(1);
		expect(result.terms).toEqual(["APIs", "Reliability"]);
	});

	it("treats a header-less answer as the one field being rewritten", () => {
		const result = parseEntry("A tighter excerpt.", targets, "excerpt");
		expect(result.values).toEqual({ excerpt: "A tighter excerpt." });
	});

	it("fails clearly when the format is ignored", () => {
		expect(() => parseEntry("Sure! Here is a post about retries.", targets)).toThrow(/=== field ===/);
	});

	it("picks every empty field, or the one asked for", () => {
		expect(pickTargets(targets, { title: "Set" }).map((t) => t.field)).toEqual(["subtitle", "excerpt", "content"]);
		expect(pickTargets(targets, { title: "Set" }, "title").map((t) => t.field)).toEqual(["title"]);
		expect(() => pickTargets(targets, { title: "a", subtitle: "b", excerpt: "c", content: [{}] })).toThrow(/already has content/);
	});

	it("trims plain-text values to one clean line", () => {
		const title = targets[0];
		expect(toFieldValue("# A heading title.\nsecond line", title)).toBe("A heading title");
		expect(() => toFieldValue("   ", title)).toThrow("empty");
	});


	it("matches terms by label or slug only", () => {
		expect(matchTerms("apis, `Reliability`, other", [{ slug: "apis", label: "APIs" }, { slug: "reliability", label: "Reliability" }])).toEqual(["APIs", "Reliability"]);
	});
});

describe("prompt", () => {
	it("names the fields, the facts rule and the site, and nothing site-specific", () => {
		const messages = buildEntryMessages({
			site: { name: "Field Notes", url: "https://example.com", locale: "en" },
			styleGuide: "Be plain.",
			about: "Written by Ada, an SRE.",
			collection: "posts",
			collectionLabel: "Post",
			collectionDescription: null,
			targets: writableTargets(posts),
			brief: "Retries and idempotency keys",
			fields: { date: "2026-10-19" },
			labels: { date: "Date" },
			terms: { taxonomy: "tags", labels: ["APIs"] },
		});
		const system = messages[0].content;
		expect(system).toContain("=== field: content ===");
		expect(system).toContain("Written by Ada");
		expect(system).toContain("Field Notes");
		expect(system).toContain("=== terms ===");
		expect(system).toMatch(/never invent facts/);
		expect(system).not.toMatch(/thijmen/i);
		expect(messages[1].content).toContain("Retries and idempotency keys");
		expect(messages[1].content).toContain("### Date (date)");
	});
});

describe("describeError", () => {
	it("explains the common failures", () => {
		expect(describeError(401, { errors: [{ code: 10000, message: "Authentication error" }] }, "", "m")).toMatch(/Workers AI → Read/);
		expect(describeError(402, null, "", "anthropic/claude-haiku-4.5")).toMatch(/credits/);
		expect(describeError(504, null, "", "m")).toMatch(/24 seconds/);
		expect(describeError(400, { error: { message: "bad max_tokens" } }, "", "m")).toBe("m: 400 bad max_tokens");
	});
});
