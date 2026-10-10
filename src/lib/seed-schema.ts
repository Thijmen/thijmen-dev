/**
 * Brings the database's schema up to the seed after a deploy, the way EmDash's
 * `auto` mode applies core migrations. EmDash applies the seed only to an
 * empty database, so without this a block type, collection or field added to
 * seed/seed.json would never reach preview or prod.
 *
 * Additive only. Block types and collections the database lacks are created by
 * EmDash's own `applySeed` (which skips anything that exists); fields the seed
 * adds to existing collections are created one by one. A block type or field
 * whose live definition differs from the seed is logged and left alone: make
 * renames, type changes and removals in the admin. Content is never touched.
 *
 * The seed's schema hash is stored in the options table once applied, so
 * after that the check costs one SELECT per isolate. One isolate claims the
 * work; the others carry on and look again on their next request.
 */
import {
	BlockTypeRegistry,
	invalidateCollectionCache,
	invalidateSchemaObjectCache,
	OptionsRepository,
	SchemaError,
	SchemaRegistry,
} from "emdash";
import { applySeed, loadSeed } from "emdash/seed";

type Db = ConstructorParameters<typeof SchemaRegistry>[0];
type Seed = Awaited<ReturnType<typeof loadSeed>>;
type SeedSchema = Required<Pick<Seed, "blockTypes" | "collections">>;
type State = { hash: string; status: "running" | "done"; at: number };

const STATE_OPTION = "site:seed_schema";
/** A claim older than this is taken over: its isolate died or failed. */
const STALE_MS = 60_000;
const LOG = "[seed-schema]";

let done = false;
let retryAt = 0;
let inFlight: Promise<void> | undefined;

/** Never throws: a failed sync is logged and retried a minute later. */
export async function syncSeedSchema(getDatabase: () => Db | Promise<Db>): Promise<void> {
	if (done || Date.now() < retryAt) return;
	inFlight ??= Promise.resolve(getDatabase())
		.then(sync)
		.then((finished) => {
			done = finished;
		})
		.catch((err) => {
			retryAt = Date.now() + STALE_MS;
			console.error(`${LOG} sync failed, retrying in a minute:`, err);
		})
		.finally(() => {
			inFlight = undefined;
		});
	await inFlight;
}

/** True once the database matches the seed; false while another isolate works on it. */
async function sync(db: Db): Promise<boolean> {
	const seed = await loadSeed();
	const schema: SeedSchema = { blockTypes: seed.blockTypes ?? [], collections: seed.collections ?? [] };
	const hash = await sha256(JSON.stringify(schema));
	const options = new OptionsRepository(db);
	const current = await options.getVersioned(STATE_OPTION);
	const state = current?.value as State | undefined;
	if (state?.hash === hash && state.status === "done") return true;
	if (state?.status === "running" && Date.now() - state.at < STALE_MS) return false;

	const running: State = { hash, status: "running", at: Date.now() };
	if (!(await options.compareAndSet(STATE_OPTION, current?.revision ?? null, running)).applied) return false;
	await apply(db, seed, schema);
	await options.set(STATE_OPTION, { hash, status: "done", at: Date.now() } satisfies State);
	return true;
}

async function apply(db: Db, seed: Seed, schema: SeedSchema) {
	const result = await applySeed(db, { version: seed.version, ...schema }, { onConflict: "skip" });
	if (result.blockTypes.created) console.log(`${LOG} created ${result.blockTypes.created} block type(s)`);
	if (result.collections.created) console.log(`${LOG} created ${result.collections.created} collection(s)`);

	const registry = new SchemaRegistry(db);
	for (const collection of schema.collections) {
		const live = await registry.getCollectionWithFields(collection.slug);
		if (!live) continue;
		for (const field of collection.fields) {
			const existing = live.fields.find((f) => f.slug === field.slug);
			if (existing) {
				if (canon(fieldShape(existing)) !== canon(fieldShape(field))) {
					console.warn(`${LOG} field ${collection.slug}.${field.slug} differs from the seed; not changed`);
				}
				continue;
			}
			// Reference fields need a relation, which only the seed's first apply sets up.
			if (field.type === "reference") {
				console.warn(`${LOG} field ${collection.slug}.${field.slug} is missing; add reference fields in the admin`);
				continue;
			}
			try {
				await registry.createField(collection.slug, {
					slug: field.slug,
					label: field.label,
					type: field.type,
					required: field.required,
					unique: field.unique,
					searchable: field.searchable,
					indexed: field.indexed,
					translatable: field.translatable,
					defaultValue: field.defaultValue,
					validation: field.validation,
					widget: field.widget,
					options: field.options,
				});
			} catch (err) {
				if (err instanceof SchemaError && err.code === "FIELD_EXISTS") continue;
				throw err;
			}
			invalidateCollectionCache(collection.slug);
			invalidateSchemaObjectCache();
			console.log(`${LOG} created field ${collection.slug}.${field.slug}`);
		}
	}

	const blockTypes = new BlockTypeRegistry(db);
	for (const bt of schema.blockTypes) {
		const live = await blockTypes.getBlockType(bt.slug);
		if (live && live.currentVersion !== bt.currentVersion) {
			console.warn(`${LOG} block type ${bt.slug} is at v${live.currentVersion}, the seed at v${bt.currentVersion}; change it in the admin`);
		}
	}
}

/** The parts of a field definition the seed controls. */
function fieldShape(f: { slug: string; type: string; required?: boolean; validation?: unknown }) {
	const validation = f.validation && typeof f.validation === "object" ? { ...(f.validation as Record<string, unknown>) } : undefined;
	if (validation) {
		// Server-managed or defaulted on a blocks field; the seed never sets them.
		delete validation.retiredTypes;
		if (validation.minItems === 0) delete validation.minItems;
	}
	const empty = !validation || Object.values(validation).every((v) => v === undefined || v === null);
	return { slug: f.slug, type: f.type, required: f.required || undefined, validation: empty ? undefined : validation };
}

/** Stable JSON for comparing definitions: sorted keys, undefined and null dropped. */
function canon(v: unknown): string {
	if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
	if (v && typeof v === "object") {
		const o = v as Record<string, unknown>;
		return `{${Object.keys(o)
			.filter((k) => o[k] !== undefined && o[k] !== null)
			.sort()
			.map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
			.join(",")}}`;
	}
	return JSON.stringify(v);
}

async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
