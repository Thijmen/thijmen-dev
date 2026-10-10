#!/usr/bin/env node
/**
 * Bring a live EmDash site's schema up to seed/seed.json: every block type,
 * collection and field in the seed that the site doesn't have yet is created
 * through the schema REST API. The seed itself only applies to an empty
 * database, so this is how schema changes reach preview and prod. The deploy
 * scripts run it after every deploy.
 *
 * Additive only: anything that already exists is skipped. A block type or
 * field that exists with a different definition is reported, never changed
 * (make those changes in the admin). Content is never touched. Stops on the
 * first error.
 *
 *   node scripts/schema-sync.mjs --url https://… [--token-env NAME] [--dry-run]
 *   node scripts/schema-sync.mjs --url-from .wrangler/preview.json …
 *
 * --url-from reads the Preview URL from saved `wrangler preview --json`
 * output. EMDASH_URL works instead of --url.
 *
 * Access guards the whole Worker, /_emdash/api included, so pass one of:
 * - CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET (the deploys): an Access
 *   service token with a Service Auth policy on the Access application. It
 *   carries no user, so also pass an EmDash API token with schema:write
 *   (admin → Settings → API Tokens on that environment) in EMDASH_TOKEN, or
 *   in the variable --token-env names.
 * - CF_ACCESS_TOKEN (by hand): your Access JWT, e.g.
 *   `cloudflared access token -app=<url>` after `cloudflared access login <url>`.
 *   EmDash signs you in from it, so no API token is needed.
 */
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const option = (name) => {
	const i = args.indexOf(name);
	return i === -1 ? undefined : args[i + 1];
};

const dryRun = args.includes("--dry-run");
const tokenEnv = option("--token-env") ?? "EMDASH_TOKEN";
const urlFrom = option("--url-from");
const token = process.env[tokenEnv];

let base;
try {
	base = (urlFrom ? await previewUrl(urlFrom) : (option("--url") ?? process.env.EMDASH_URL))?.replace(/\/$/, "");
} catch (err) {
	console.error(`Stopped: ${err.message}`);
	process.exit(1);
}
if (!base || !(token || process.env.CF_ACCESS_TOKEN)) {
	console.error(`Set --url (or --url-from, EMDASH_URL), and CF_ACCESS_TOKEN or ${tokenEnv}.`);
	process.exit(1);
}

const headers = {
	"Content-Type": "application/json",
	"X-EmDash-Request": "1",
};
if (token) headers.Authorization = `Bearer ${token}`;
if (process.env.CF_ACCESS_TOKEN) headers["cf-access-token"] = process.env.CF_ACCESS_TOKEN;
if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
	headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
	headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
}

/** The Preview URL from saved `wrangler preview --json` output. */
async function previewUrl(file) {
	const text = await readFile(file, "utf8");
	// Wrangler pretty-prints one object; skip anything it logged around it.
	const start = text.search(/^\{\s*$/m);
	const end = text.lastIndexOf("\n}");
	let out;
	try {
		out = JSON.parse(start === -1 || end < start ? text : text.slice(start, end + 2));
	} catch {
		throw new Error(`${file} doesn't hold \`wrangler preview --json\` output`);
	}
	const url = out.preview?.urls?.[0] ?? out.deployment?.urls?.[0];
	if (!url) throw new Error(`${file} has no Preview URL`);
	return /^https?:\/\//.test(url) ? url : `https://${url}`;
}

/** A failed GET worth trying again: the site isn't serving yet. */
class NotReady extends Error {}

async function api(method, path, body) {
	let res;
	try {
		res = await fetch(`${base}/_emdash/api/schema${path}`, {
			method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
			redirect: "manual",
		});
	} catch (err) {
		throw new NotReady(`${method} ${path}: ${err.cause?.message ?? err.message}`);
	}
	if (res.status >= 300 && res.status < 400) {
		const to = res.headers.get("location")?.split("?")[0] ?? "?";
		throw new Error(`${method} ${path}: redirected to ${to} (Access didn't accept the credentials)`);
	}
	if (method === "GET" && res.status === 404) return null;
	if (method === "GET" && res.status >= 500) throw new NotReady(`${method} ${path}: HTTP ${res.status}`);
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

/** A Preview that was just deployed can take a few seconds to serve. */
async function listBlockTypes() {
	const attempts = 15;
	for (let attempt = 1; ; attempt++) {
		let error;
		try {
			const data = await api("GET", "/block-types");
			if (data) return data.items;
			error = new Error("GET /block-types: HTTP 404 (is EmDash on this URL?)");
		} catch (err) {
			if (!(err instanceof NotReady)) throw err;
			error = err;
		}
		if (attempt === attempts) throw error;
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
}

const counts = { create: 0, skip: 0, differs: 0 };
const log = (verb, what) => {
	counts[verb]++;
	console.log(`${dryRun && verb === "create" ? "(dry) create" : verb}\t${what}`);
};

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
	const empty = validation && Object.keys(validation).every((k) => validation[k] === undefined || validation[k] === null);
	return { slug: f.slug, type: f.type, required: f.required || undefined, validation: empty ? undefined : validation };
}

async function applyBlockTypes(seed) {
	const existing = new Map((await listBlockTypes()).map((b) => [b.slug, b]));
	for (const bt of seed.blockTypes ?? []) {
		const version = bt.versions.find((v) => v.version === bt.currentVersion);
		if (!version) throw new Error(`block type ${bt.slug}: seed has no version ${bt.currentVersion}`);
		const live = existing.get(bt.slug);
		if (live) {
			const active = live.versions.find((v) => v.version === live.currentVersion);
			const same = active && canon(active.fields.map(fieldShape)) === canon(version.fields.map(fieldShape));
			log(same ? "skip" : "differs", `block type ${bt.slug}${same ? "" : ` (live v${live.currentVersion} differs from the seed's v${bt.currentVersion}; not changed)`}`);
			continue;
		}
		// The API creates version 1; later versions are added in the admin.
		if (bt.currentVersion !== 1) {
			log("differs", `block type ${bt.slug} (missing, and only version 1 can be created here; not changed)`);
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
	for (const def of seed.collections ?? []) {
		const live = await api("GET", `/collections/${def.slug}?includeFields=true`);
		if (!live) {
			log("create", `collection ${def.slug}`);
			if (!dryRun) {
				const { fields: _fields, ...meta } = def;
				await api("POST", "/collections", meta);
			}
		} else {
			log("skip", `collection ${def.slug}`);
		}
		const liveFields = live?.item?.fields ?? [];
		for (const field of def.fields) await applyField(def.slug, field, liveFields);
	}
}

const seed = JSON.parse(await readFile(new URL("../seed/seed.json", import.meta.url), "utf8"));
console.log(`${dryRun ? "Dry run against" : "Applying to"} ${base}`);
try {
	await applyBlockTypes(seed);
	await applyCollections(seed);
	console.log(`Done: ${counts.create} ${dryRun ? "to create" : "created"}, ${counts.skip} up to date, ${counts.differs} differ.`);
	if (counts.differs > 0) console.log("Differences are never changed here: make them in the admin, then match the seed.");
} catch (err) {
	console.error(`Stopped: ${err.message}`);
	process.exit(1);
}
