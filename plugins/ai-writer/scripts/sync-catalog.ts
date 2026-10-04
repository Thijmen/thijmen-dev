/**
 * Refresh the bundled model catalog snapshot (src/catalog.snapshot.json),
 * the writer's fallback when the live docs catalog or a price can't be fetched.
 * Run: pnpm --filter @thijmen/plugin-ai-writer catalog:sync
 */
import { writeFileSync } from "node:fs";

import { CATALOG_URL, parseCatalog } from "../src/catalog.ts";
import { modelPageUrl, parseModelPagePrice, parseWorkersAIPrices, type Price, WORKERS_AI_PRICING_URL } from "../src/pricing.ts";

async function text(url: string): Promise<string> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	return res.text();
}

const models = parseCatalog(await text(CATALOG_URL));
if (models.length < 20) throw new Error(`Only ${models.length} text-generation models parsed; the docs page layout probably changed`);

// Workers AI prices share one table; third-party ones live on each model page.
const hosted = parseWorkersAIPrices(await text(WORKERS_AI_PRICING_URL));
const prices: Record<string, Price> = {};
const thirdParty = models.filter((m) => !m.hosted);
for (let i = 0; i < thirdParty.length; i += 8) {
	await Promise.all(
		thirdParty.slice(i, i + 8).map(async (m) => {
			const price = parseModelPagePrice(await text(modelPageUrl(m.id)).catch(() => ""));
			if (price) prices[m.id] = price;
		}),
	);
}
for (const m of models) if (m.hosted && hosted[m.id]) prices[m.id] = hosted[m.id];

const out = new URL("../src/catalog.snapshot.json", import.meta.url);
const sorted = Object.fromEntries(Object.entries(prices).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(out, `${JSON.stringify({ fetchedAt: new Date().toISOString(), models, prices: sorted }, null, "\t")}\n`);
console.log(`${models.length} text-generation models, ${Object.keys(prices).length} with a price → ${out.pathname}`);
