#!/usr/bin/env node
/**
 * Push the seed's block types, the `pages` collection and the blocks fields
 * on posts/projects to a live EmDash site. The seed only applies to an empty
 * database, and `emdash schema` has no block-type commands, so preview and
 * prod get these through the schema REST API.
 *
 * Idempotent: anything that already exists is skipped. A block type or field
 * that exists with a different definition is reported, never changed. Content
 * is never touched. Stops on the first error.
 *
 *   EMDASH_URL=https://… EMDASH_TOKEN=… node scripts/apply-blocks-schema.mjs [--dry-run]
 *
 * EMDASH_TOKEN: an API token (Settings → API Tokens) with schema:write.
 * CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET: optional Access service
 * token, sent when set (needed if Access also guards /_emdash/api).
 */
import { readFile } from "node:fs/promises";

/** Collections whose seed definition is created in full when missing. */
const NEW_COLLECTIONS = ["pages"];
/** Fields added to collections that already exist everywhere. */
const NEW_FIELDS = [
	["posts", "sections"],
	["projects", "body"],
];

const dryRun = process.argv.includes("--dry-run");
const base = process.env.EMDASH_URL?.replace(/\/$/, "");
const token = process.env.EMDASH_TOKEN;
if (!base || !token) {
	console.error("Set EMDASH_URL and EMDASH_TOKEN.");
	process.exit(1);
}

const headers = {
	Authorization: `Bearer ${token}`,
	"Content-Type": "application/json",
	"X-EmDash-Request": "1",
};
if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
	headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
	headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
}

async function api(method, path, body) {
	const res = await fetch(`${base}/_emdash/api/schema${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
		redirect: "manual",
	});
	if (method === "GET" && res.status === 404) return null;
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		throw new Error(`${method} ${path}: HTTP ${res.status}, not JSON (Access login page?): ${text.slice(0, 120)}`);
	}
	if (!res.ok || json.success === false) {
		throw new Error(`${method} ${path}: HTTP ${res.status} ${json.error?.code ?? ""} ${json.error?.message ?? text.slice(0, 200)}`);
	}
	return json.data;
}

const log = (verb, what) => console.log(`${dryRun && verb !== "skip" && verb !== "differs" ? `(dry) ${verb}` : verb}\t${what}`);

/** Stable JSON for comparing definitions: sorted keys, undefined dropped. */
function canon(v) {
	if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
	if (v && typeof v === "object") {
		return `{${Object.keys(v)
			.filter((k) => v[k] !== undefined && v[k] !== null)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canon(v[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(v);
}

/** The parts of a field definition the seed controls. */
function fieldShape(f) {
	const validation = f.validation ? { ...f.validation } : undefined;
	if (validation) {
		// Server-managed or defaulted on a blocks field; the seed never sets them.
		delete validation.retiredTypes;
		if (validation.minItems === 0) delete validation.minItems;
	}
	return { slug: f.slug, type: f.type, required: f.required || undefined, validation };
}

async function applyBlockTypes(seed) {
	const { items } = await api("GET", "/block-types");
	const existing = new Map(items.map((b) => [b.slug, b]));
	for (const bt of seed.blockTypes ?? []) {
		const version = bt.versions.find((v) => v.version === bt.currentVersion);
		if (bt.currentVersion !== 1 || !version) {
			throw new Error(`block type ${bt.slug}: only version 1 can be created by this script`);
		}
		const live = existing.get(bt.slug);
		if (live) {
			const active = live.versions.find((v) => v.version === live.currentVersion);
			const same = active && canon(active.fields.map(fieldShape)) === canon(version.fields.map(fieldShape));
			log(same ? "skip" : "differs", `block type ${bt.slug}${same ? "" : ` (live v${live.currentVersion} differs from the seed; not changed)`}`);
			continue;
		}
		log("create", `block type ${bt.slug}`);
		if (!dryRun) {
			await api("POST", "/block-types", {
				slug: bt.slug,
				label: bt.label,
				description: bt.description,
				icon: bt.icon,
				category: bt.category,
				fields: version.fields,
			});
		}
	}
}

async function applyField(collection, field, liveFields) {
	const live = liveFields.find((f) => f.slug === field.slug);
	if (live) {
		const same = canon(fieldShape(live)) === canon(fieldShape(field));
		log(same ? "skip" : "differs", `field ${collection}.${field.slug}${same ? "" : " (live definition differs from the seed; not changed)"}`);
		return;
	}
	log("create", `field ${collection}.${field.slug}`);
	if (!dryRun) {
		await api("POST", `/collections/${collection}/fields`, {
			slug: field.slug,
			label: field.label,
			type: field.type,
			required: field.required,
			defaultValue: field.defaultValue,
			validation: field.validation ?? null,
		});
	}
}

async function applyCollections(seed) {
	const bySlug = new Map(seed.collections.map((c) => [c.slug, c]));

	for (const slug of NEW_COLLECTIONS) {
		const def = bySlug.get(slug);
		const live = await api("GET", `/collections/${slug}?includeFields=true`);
		if (!live) {
			log("create", `collection ${slug}`);
			if (!dryRun) {
				const { fields: _fields, ...meta } = def;
				await api("POST", "/collections", meta);
			}
		} else {
			log("skip", `collection ${slug}`);
		}
		const liveFields = live?.item?.fields ?? [];
		for (const field of def.fields) await applyField(slug, field, liveFields);
	}

	for (const [slug, fieldSlug] of NEW_FIELDS) {
		const field = bySlug.get(slug)?.fields.find((f) => f.slug === fieldSlug);
		if (!field) throw new Error(`seed has no field ${slug}.${fieldSlug}`);
		const live = await api("GET", `/collections/${slug}?includeFields=true`);
		if (!live) throw new Error(`collection ${slug} does not exist on ${base}`);
		await applyField(slug, field, live.item.fields);
	}
}

const seed = JSON.parse(await readFile(new URL("../seed/seed.json", import.meta.url), "utf8"));
console.log(`${dryRun ? "Dry run against" : "Applying to"} ${base}`);
try {
	await applyBlockTypes(seed);
	await applyCollections(seed);
	console.log("Done.");
} catch (err) {
	console.error(`Stopped: ${err.message}`);
	process.exit(1);
}
