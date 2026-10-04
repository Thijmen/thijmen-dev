/**
 * List prices per model, from Cloudflare's docs (there's no pricing API):
 * third-party catalog models have a Pricing row on their model page,
 * Workers AI (`@cf/…`) models share one table on the Workers AI pricing page.
 * Dependency-free: `scripts/sync-catalog.ts` uses it for the bundled snapshot.
 */

/** USD per 1M tokens. Cache prices are missing when the docs don't list them. */
export type Price = { input: number; output: number; cacheRead?: number; cacheWrite?: number };

export const WORKERS_AI_PRICING_URL = "https://developers.cloudflare.com/workers-ai/platform/pricing/index.md";

export function modelPageUrl(id: string): string {
	return `https://developers.cloudflare.com/ai/models/${id.replace(/^@/, "%40")}/index.md`;
}

/**
 * A third-party model page's Pricing row:
 * `| Pricing | <ul><li>Input (per 1M tokens)$4.00</li><li>Cached input (per 1M tokens)$0.20</li>…</ul> |`.
 * Tiered prices ("Input <=200k (per 1M)", "Short-context input …") take the first, smallest tier.
 */
export function parseModelPagePrice(markdown: string): Price | null {
	const row = markdown.match(/^\|\s*Pricing\s*\|(.*)\|\s*$/m)?.[1];
	if (!row) return null;
	const price: Partial<Price> = {};
	for (const [, label, amount] of row.matchAll(/<li>([^<$]*?)\$([\d.,]+)<\/li>/g)) {
		if (!/per 1M/i.test(label)) continue;
		const key = priceKey(label);
		if (key && price[key] === undefined) price[key] = Number(amount.replace(/,/g, ""));
	}
	return complete(price);
}

/**
 * The Workers AI pricing table, one row per model:
 * `| @cf/moonshotai/kimi-k2.6 | $0.950 per M input tokens <br> $0.160 per M cached input tokens <br> $4.000 per M output tokens | … |`.
 */
export function parseWorkersAIPrices(markdown: string): Record<string, Price> {
	const prices: Record<string, Price> = {};
	for (const [, id, cell] of markdown.matchAll(/^\|\s*(@cf\/[^\s|]+)\s*\|([^|]*)\|/gm)) {
		const price: Partial<Price> = {};
		for (const [, amount, label] of cell.matchAll(/\$([\d.,]+) per M ([a-z ]+?) tokens/gi)) {
			const key = priceKey(label);
			if (key && price[key] === undefined) price[key] = Number(amount.replace(/,/g, ""));
		}
		const done = complete(price);
		if (done && !prices[id]) prices[id] = done;
	}
	return prices;
}

function priceKey(label: string): keyof Price | null {
	const l = label.toLowerCase();
	if (/cache (creation|write)|cache[d]? write/.test(l)) return "cacheWrite";
	if (/cached input|cache read/.test(l)) return "cacheRead";
	// Tier prefixes too: "Input <=200k", "Short-context input".
	if (/\binput\b/.test(l)) return "input";
	if (/\boutput\b/.test(l)) return "output";
	return null;
}

function complete(price: Partial<Price>): Price | null {
	return typeof price.input === "number" && typeof price.output === "number" && Number.isFinite(price.input + price.output) ? (price as Price) : null;
}

/** Tokens of one model step, split the way providers bill them. */
export type Usage = { input: number; cacheRead: number; cacheWrite: number; output: number };

export const NO_USAGE: Usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };

/** From the AI SDK's usage: `input` is the uncached part. */
export function usageOf(u: {
	inputTokens?: number;
	outputTokens?: number;
	inputTokenDetails?: { noCacheTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number };
}): Usage {
	const cacheRead = u.inputTokenDetails?.cacheReadTokens ?? 0;
	const cacheWrite = u.inputTokenDetails?.cacheWriteTokens ?? 0;
	const input = u.inputTokenDetails?.noCacheTokens ?? Math.max(0, (u.inputTokens ?? 0) - cacheRead - cacheWrite);
	return { input, cacheRead, cacheWrite, output: u.outputTokens ?? 0 };
}

export function addUsage(a: Usage, b: Usage): Usage {
	return { input: a.input + b.input, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite, output: a.output + b.output };
}

/** USD at list price. Cache tokens without a listed price count as input. */
export function costOf(usage: Usage, price: Price): number {
	return (
		(usage.input * price.input +
			usage.cacheRead * (price.cacheRead ?? price.input) +
			usage.cacheWrite * (price.cacheWrite ?? price.input) +
			usage.output * price.output) /
		1_000_000
	);
}

/** "$0.042", "$1.37", "<$0.001". */
export function formatUsd(usd: number): string {
	if (usd === 0) return "$0.00";
	if (usd < 0.001) return "<$0.001";
	return `$${usd < 1 ? usd.toFixed(3) : usd.toFixed(2)}`;
}
