/**
 * `fetch_url` for the agent: read a page the brief links to as plain text.
 * Public http(s) only, 10s, first ~40 KB of text.
 */

const MAX_CHARS = 40_000;
const TIMEOUT_MS = 10_000;

// Hostnames that point back into infrastructure rather than at the web.
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f]{2}:.*)$/i;

export type FetchedPage = { url: string; title: string | null; text: string; truncated: boolean } | { url: string; error: string };

export async function fetchUrl(raw: string): Promise<FetchedPage> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return { url: raw, error: "Not a valid URL" };
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return { url: raw, error: "Only http(s) URLs" };
	if (PRIVATE_HOST.test(url.hostname)) return { url: raw, error: "Private or local addresses are not fetched" };

	try {
		const res = await fetch(url, {
			redirect: "follow",
			signal: AbortSignal.timeout(TIMEOUT_MS),
			headers: { "User-Agent": "thijmen.dev-ai-writer/1.0", Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.5" },
		});
		if (!res.ok) return { url: url.href, error: `HTTP ${res.status}` };
		const type = res.headers.get("content-type") ?? "";
		if (!/text\/|json|xml/.test(type)) return { url: url.href, error: `Unsupported content type: ${type || "unknown"}` };
		const body = (await res.text()).slice(0, MAX_CHARS * 4);
		const isHtml = /html/.test(type) || /^\s*<(!doctype|html)/i.test(body);
		const text = isHtml ? htmlToText(body) : body;
		return {
			url: res.url || url.href,
			title: isHtml ? (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1]?.trim() ?? null) : null,
			text: text.slice(0, MAX_CHARS),
			truncated: text.length > MAX_CHARS,
		};
	} catch (error) {
		return { url: url.href, error: error instanceof Error ? error.message : String(error) };
	}
}

/** Readable text from HTML: drop scripts/styles/nav chrome, keep headings and paragraphs as lines. */
export function htmlToText(html: string): string {
	return html
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<(head|script|style|noscript|svg|nav|footer|header|form|iframe)\b[\s\S]*?<\/\1>/gi, "")
		.replace(/<h([1-6])[^>]*>/gi, (_, n) => `\n\n${"#".repeat(Number(n))} `)
		.replace(/<(br|\/p|\/div|\/h[1-6]|\/tr|\/pre|\/blockquote|\/ul|\/ol)\s*\/?>/gi, "\n")
		.replace(/<li[^>]*>/gi, "\n- ")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
		.replace(/[ \t]+/g, " ")
		.replace(/ *\n */g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}
