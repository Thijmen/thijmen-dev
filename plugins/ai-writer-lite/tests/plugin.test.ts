/**
 * End-to-end through EmDash's production sandbox (Worker Loader + PluginBridge),
 * with Cloudflare's AI API mocked by the test host's HTTP queue.
 */
import { afterEach, describe, expect, it } from "vitest";

import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const CHAT_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/v1/chat/completions`;

let host: PluginRuntimeTestHost | undefined;

/** EmDash encrypts secret settings with this; a real site sets it as a Worker secret. */
function encryptionKey(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	return `emdash_enc_v1_${b64}`;
}
process.env.EMDASH_ENCRYPTION_KEY = encryptionKey();

afterEach(async () => {
	await host?.dispose();
	host = undefined;
});

function completion(text: string, status = 200): Response {
	return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 812, completion_tokens: 240 } }), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function setup(options: { revisions?: boolean } = {}) {
	host = await createPluginRuntimeTestHost({ site: { name: "Field Notes", url: "https://example.com" } });
	await host.fixtures.collection({
		slug: "posts",
		label: "Posts",
		labelSingular: "Post",
		supports: options.revisions === false ? ["drafts"] : ["drafts", "revisions"],
		hasSeo: true,
		fields: [
			{ slug: "title", label: "Title", type: "string" },
			{ slug: "excerpt", label: "Excerpt", type: "text" },
			{ slug: "content", label: "Content", type: "portableText" },
			{ slug: "date", label: "Date", type: "datetime", required: true },
			{ slug: "source_url", label: "Source URL", type: "string" },
		],
	});
	await host.fixtures.taxonomyDefinition({ name: "tag", label: "Tags", collections: ["posts"] });
	await host.fixtures.taxonomy({ name: "tag", slug: "apis", label: "APIs" });
	await host.fixtures.taxonomy({ name: "tag", slug: "reliability", label: "Reliability" });
	return host;
}

async function connect(h: PluginRuntimeTestHost, extra: Record<string, unknown> = {}) {
	const page = await h.admin.submit("/settings", "save", {
		accountId: ACCOUNT,
		apiToken: "test-token",
		gateway: "default",
		model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
		customModel: "",
		maxTokens: 3000,
		about: "Written by Ada, an SRE.",
		styleGuide: "",
		skipFields: "",
		...extra,
	});
	expect(JSON.stringify(page.blocks)).not.toContain("Not saved");
}

const blocksText = (response: { blocks: unknown[] }) => JSON.stringify(response.blocks);

describe("settings", () => {
	it("saves the connection and keeps the token out of the page", async () => {
		const h = await setup();
		await connect(h);
		const page = await h.admin.loadPage("/settings");
		const text = blocksText(page);
		expect(text).toContain(ACCOUNT);
		expect(text).not.toContain("test-token");
		expect(text).toContain('"has_value":true');
		expect(await h.inspect.setting("config")).toMatchObject({ accountId: ACCOUNT, model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" });
		// Stored as an encrypted envelope, never the plaintext.
		expect(JSON.stringify(await h.inspect.settings.raw("apiToken"))).not.toContain("test-token");
	});

	it("rejects an invalid account id", async () => {
		const h = await setup();
		const page = await h.admin.submit("/settings", "save", { accountId: "nope", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", maxTokens: 3000 });
		expect(blocksText(page)).toContain("Not saved");
	});

	it("tests the connection with one short call", async () => {
		const h = await setup();
		await connect(h);
		await h.http.respond(CHAT_URL, completion("OK"));
		const page = await h.admin.act("/settings", "test");
		expect(blocksText(page)).toContain("Connected");
		const [request] = h.http.requests();
		expect(request.headers.authorization).toBe("Bearer test-token");
		expect(request.headers["cf-aig-gateway-id"]).toBe("default");
		expect(request.headers["cf-aig-request-timeout"]).toBe("24000");
	});
});

describe("New with AI", () => {
	it("asks for setup before anything else", async () => {
		const h = await setup();
		expect(blocksText(await h.admin.loadPage("/new"))).toContain("Connect Cloudflare first");
	});

	it("writes a draft with every text field, defaults the date, and logs the run", async () => {
		const h = await setup();
		await connect(h);
		await h.http.respond(
			CHAT_URL,
			completion(`=== field: title ===
Retries need a *contract*
=== field: excerpt ===
Idempotency keys make retries safe. [TODO: which provider]
=== field: content ===
## The problem

Requests fail halfway.
=== terms ===
APIs, Reliability`),
		);

		const page = await h.admin.submit("/new", "create", { collection: "posts", brief: "Retries and idempotency keys" });
		const text = blocksText(page);
		expect(text).toContain("Draft created: Retries need a *contract*");
		expect(text).toContain("1 [TODO] marker");
		expect(text).toContain("APIs, Reliability");

		const [request] = h.http.requests();
		const body = JSON.parse(new TextDecoder().decode(request.body));
		expect(body.model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
		expect(body.messages[0].content).toContain("Written by Ada");
		expect(body.messages[0].content).not.toContain("source_url");

		const [item] = await h.inspect.content.list("posts");
		expect(item.status).toBe("draft");
		expect(item.data.title).toBe("Retries need a *contract*");
		expect(item.data.content).toMatchObject([{ style: "h2" }, { style: "normal" }]);
		expect(typeof item.data.date).toBe("string");
		expect(item.data.source_url ?? null).toBeNull();

		const runs = await h.inspect.storage.list<{ status: string; written: number; inputTokens: number }>("runs");
		expect(runs).toHaveLength(1);
		expect(runs[0].data).toMatchObject({ status: "ok", written: 3, inputTokens: 812 });
		expect(blocksText(await h.admin.loadPage("/runs"))).toContain("new posts");
	});

	it("explains a model error and saves nothing", async () => {
		const h = await setup();
		await connect(h, { model: "anthropic/claude-haiku-4.5" });
		await h.http.respond(CHAT_URL, new Response(JSON.stringify({ errors: [{ code: 7000, message: "Insufficient credits" }] }), { status: 402 }));
		const page = await h.admin.submit("/new", "create", { collection: "posts", brief: "Anything" });
		expect(blocksText(page)).toContain("No AI Gateway credits");
		expect(await h.inspect.content.list("posts")).toHaveLength(0);
		const runs = await h.inspect.storage.list<{ status: string }>("runs");
		expect(runs[0].data.status).toBe("error");
	});
});

describe("editor panel", () => {
	it("fills the empty fields of a saved entry as draft changes", async () => {
		const h = await setup();
		await connect(h);
		const entry = await h.fixtures.content("posts", { data: { title: "Retries need a contract", date: "2026-10-01T00:00:00.000Z" } });

		const load = await h.admin.loadEditorPanel("write", "posts", entry.id);
		expect(blocksText(load)).toContain("Every empty field (2)");

		await h.http.respond(
			CHAT_URL,
			completion(`=== field: excerpt ===
Keys make retries safe.
=== field: content ===
Requests fail halfway.`),
		);
		const result = await h.admin.submitEditorPanel("write", "posts", entry.id, "write", { brief: "", only: "__empty" });
		expect(result.refresh).toBe(true);
		expect(result.toast?.message).toBe("Wrote Excerpt, Content");

		const body = JSON.parse(new TextDecoder().decode(h.http.requests()[0].body));
		// The existing title goes along as context.
		expect(body.messages[1].content).toContain("Retries need a contract");

		const saved = await h.inspect.content.get("posts", entry.id);
		expect(saved?.status).toBe("draft");
	});

	it("works from the pending draft of a published entry and leaves the live version alone", async () => {
		const h = await setup();
		await connect(h);
		const entry = await h.fixtures.content("posts", { slug: "retries", data: { title: "Live title", date: "2026-10-01T00:00:00.000Z" } });
		const published = await h.actions.content.publish("posts", entry.id);
		expect(published.success, JSON.stringify(published)).toBe(true);
		const updated = await h.actions.content.update("posts", entry.id, { data: { title: "Draft title" } });
		expect(updated.success, JSON.stringify(updated)).toBe(true);

		await h.http.respond(CHAT_URL, completion("=== field: excerpt ===\nAn excerpt.\n=== field: content ===\nThe body."));
		const result = await h.admin.submitEditorPanel("write", "posts", entry.id, "write", { brief: "", only: "__empty" });
		expect(result.toast?.message).toBe("Wrote Excerpt, Content");

		const prompt = JSON.parse(new TextDecoder().decode(h.http.requests()[0].body)).messages[1].content;
		expect(prompt).toContain("Draft title");
		expect(prompt).not.toContain("Live title");

		const saved = await h.inspect.content.get("posts", entry.id);
		expect(saved?.status).toBe("published");
		expect(saved?.data.title).toBe("Live title");
		expect(saved?.data.excerpt ?? null).toBeNull();
		expect(saved?.draftRevisionId).toBeTruthy();
	});

	it("rewrites one field on request", async () => {
		const h = await setup();
		await connect(h);
		const entry = await h.fixtures.content("posts", { data: { title: "Old title", excerpt: "Old excerpt", date: "2026-10-01T00:00:00.000Z" } });
		await h.http.respond(CHAT_URL, completion("A sharper title"));
		const result = await h.admin.submitEditorPanel("write", "posts", entry.id, "write", { brief: "Make it sharper", only: "title" });
		expect(result.toast?.message).toBe("Wrote Title");
		const body = JSON.parse(new TextDecoder().decode(h.http.requests()[0].body));
		expect(body.messages[1].content).toContain("Rewrite the title");
	});

	it("refuses a published entry in a collection without revisions", async () => {
		const h = await setup({ revisions: false });
		await connect(h);
		const entry = await h.fixtures.content("posts", { data: { title: "Live", date: "2026-10-01T00:00:00.000Z" }, status: "published" });
		const load = await h.admin.loadEditorPanel("write", "posts", entry.id);
		expect(blocksText(load)).toContain("Only drafts in this collection");
	});
});
