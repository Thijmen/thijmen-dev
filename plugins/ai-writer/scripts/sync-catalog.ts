/**
 * Refresh the bundled model catalog snapshot (src/catalog.snapshot.json),
 * the writer's fallback when the live docs catalog can't be fetched.
 * Run: pnpm --filter @thijmen/plugin-ai-writer catalog:sync
 */
import { writeFileSync } from "node:fs";

import { CATALOG_URL, parseCatalog } from "../src/catalog.ts";

const res = await fetch(CATALOG_URL);
if (!res.ok) throw new Error(`${CATALOG_URL}: HTTP ${res.status}`);
const models = parseCatalog(await res.text());
if (models.length < 20) throw new Error(`Only ${models.length} text-generation models parsed; the docs page layout probably changed`);
const out = new URL("../src/catalog.snapshot.json", import.meta.url);
writeFileSync(out, `${JSON.stringify({ fetchedAt: new Date().toISOString(), models }, null, "\t")}\n`);
console.log(`${models.length} text-generation models → ${out.pathname}`);
