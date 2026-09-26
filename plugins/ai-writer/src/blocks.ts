/**
 * Blocks fields (`posts.sections`, `projects.body`, `pages.body`): describe the
 * allowed block types to the model, then validate what comes back against the
 * same definitions. The definitions come from the site's seed, the source
 * `pnpm schema:blocks` applies to preview/prod, so they match the live schema.
 */
import seed from "../../../seed/seed.json";
import { LANGUAGE_ALIASES, makeKey, markdownToPortableText } from "./markdown-to-pt";

type BlockField = {
	slug: string;
	label: string;
	type: string;
	required?: boolean;
	defaultValue?: unknown;
	validation?: {
		options?: string[];
		min?: number;
		max?: number;
		minItems?: number;
		subFields?: BlockField[];
	};
};
type BlockType = {
	slug: string;
	label: string;
	description?: string;
	currentVersion: number;
	versions: Array<{ version: number; fields: BlockField[] }>;
};

const BLOCK_TYPES = new Map((seed.blockTypes as BlockType[]).map((b) => [b.slug, b]));

// These need real media from the library; the model can't pick images.
const EXCLUDED = new Set(["figure", "gallery"]);

function fieldsOf(type: BlockType): BlockField[] {
	return type.versions.find((v) => v.version === type.currentVersion)?.fields ?? [];
}

/** Allowed types for a field: the draft's field validation, else the seed's. */
export function allowedBlockTypes(collection: string, field: string, validation?: unknown): string[] {
	let allowed = (validation as { allowedTypes?: string[] } | undefined)?.allowedTypes;
	if (!allowed) {
		const def = (seed.collections as Array<{ slug: string; fields: Array<{ slug: string; validation?: any }> }>)
			.find((c) => c.slug === collection)
			?.fields.find((f) => f.slug === field);
		allowed = def?.validation?.allowedTypes;
	}
	return (allowed ?? [...BLOCK_TYPES.keys()]).filter((t) => BLOCK_TYPES.has(t) && !EXCLUDED.has(t));
}

export function maxBlocks(validation?: unknown): number {
	const max = (validation as { maxItems?: number } | undefined)?.maxItems;
	return typeof max === "number" && max > 0 ? max : 40;
}

/** Compact, model-readable spec of the allowed block types. */
export function describeBlockTypes(types: string[]): string {
	return types
		.map((slug) => {
			const type = BLOCK_TYPES.get(slug)!;
			const fields = fieldsOf(type).map((f) => `    ${describeField(f)}`);
			return [`- "${slug}": ${type.description ?? type.label}`, ...fields].join("\n");
		})
		.join("\n");
}

function describeField(f: BlockField): string {
	const bits: string[] = [];
	switch (f.type) {
		case "portableText":
			bits.push("markdown string");
			break;
		case "select":
			bits.push(`one of ${JSON.stringify(f.validation?.options ?? [])}`);
			break;
		case "integer":
			bits.push(`integer${f.validation?.min !== undefined ? ` ${f.validation.min}–${f.validation.max}` : ""}`);
			break;
		case "repeater":
			bits.push(
				`array of { ${(f.validation?.subFields ?? []).map((s) => `${s.slug}: ${s.type}${s.required ? "" : "?"}`).join(", ")} }`,
			);
			break;
		default:
			bits.push(f.type);
	}
	if (f.required) bits.push("required");
	if (f.defaultValue !== undefined) bits.push(`default ${JSON.stringify(f.defaultValue)}`);
	return `${f.slug} (${bits.join(", ")}): ${f.label}`;
}

export type BlocksResult = { blocks: Record<string, unknown>[]; dropped: string[] };

/**
 * Parse the model's JSON array and keep only blocks that fit the schema.
 * Unknown fields are dropped, defaults filled in, markdown turned into PT,
 * and `_key` / `_version` added as the editor stores them.
 */
export function normaliseBlocks(raw: string, allowed: string[], max: number): BlocksResult {
	const parsed = parseJsonArray(raw);
	const blocks: Record<string, unknown>[] = [];
	const dropped: string[] = [];
	for (const item of parsed) {
		const type = typeof item?._type === "string" ? item._type : typeof item?.type === "string" ? item.type : "";
		const def = BLOCK_TYPES.get(type);
		if (!def || !allowed.includes(type)) {
			dropped.push(`${type || "?"}: not allowed here`);
			continue;
		}
		const out: Record<string, unknown> = { _type: type, _version: def.currentVersion, _key: makeKey() };
		let problem: string | null = null;
		for (const field of fieldsOf(def)) {
			const value = coerce(field, item[field.slug]);
			if (value === undefined) {
				if (field.required || (field.validation?.minItems ?? 0) > 0) {
					problem = `${type}: missing ${field.slug}`;
					break;
				}
				if (field.defaultValue !== undefined) out[field.slug] = field.defaultValue;
				continue;
			}
			out[field.slug] = value;
		}
		if (problem) dropped.push(problem);
		else if (blocks.length >= max) dropped.push(`${type}: over the ${max}-block limit`);
		else blocks.push(out);
	}
	return { blocks, dropped };
}

function coerce(field: BlockField, value: unknown): unknown {
	if (value === undefined || value === null || value === "") return undefined;
	switch (field.type) {
		case "string":
		case "text":
		case "url":
			return typeof value === "string" ? value.trim() || undefined : undefined;
		case "portableText": {
			const md = typeof value === "string" ? value : undefined;
			const pt = md ? markdownToPortableText(md) : [];
			return pt.length ? pt : undefined;
		}
		case "select": {
			if (typeof value !== "string") return undefined;
			const options = field.validation?.options ?? [];
			const v = options.includes(value) ? value : LANGUAGE_ALIASES[value.toLowerCase()];
			return v && options.includes(v) ? v : undefined;
		}
		case "integer":
		case "number": {
			const n = typeof value === "number" ? value : Number(value);
			if (!Number.isFinite(n)) return undefined;
			const { min = -Infinity, max = Infinity } = field.validation ?? {};
			const clamped = Math.min(Math.max(n, min), max);
			return field.type === "integer" ? Math.round(clamped) : clamped;
		}
		case "boolean":
			return typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : undefined;
		case "repeater": {
			if (!Array.isArray(value)) return undefined;
			const subFields = field.validation?.subFields ?? [];
			const items = value
				.map((row) => {
					if (!row || typeof row !== "object") return null;
					const out: Record<string, unknown> = {};
					for (const sub of subFields) {
						const v = coerce(sub, (row as Record<string, unknown>)[sub.slug]);
						if (v === undefined && sub.required) return null;
						if (v !== undefined) out[sub.slug] = v;
					}
					return out;
				})
				.filter((row): row is Record<string, unknown> => row !== null);
			return items.length >= (field.validation?.minItems ?? 0) && items.length ? items : undefined;
		}
		default:
			return undefined;
	}
}

function parseJsonArray(raw: string): Array<Record<string, any>> {
	const text = unfence(raw);
	const start = text.indexOf("[");
	const end = text.lastIndexOf("]");
	if (start === -1 || end <= start) throw new Error("The model didn't return a JSON array of blocks");
	let parsed: unknown;
	try {
		parsed = JSON.parse(text.slice(start, end + 1));
	} catch {
		throw new Error("The model returned blocks that aren't valid JSON");
	}
	if (!Array.isArray(parsed)) throw new Error("The model didn't return a JSON array of blocks");
	return parsed.filter((item) => item && typeof item === "object");
}

/**
 * Strip one wrapping ```json / ```markdown fence, which models add to "only
 * JSON" answers anyway. A fence with a code language is real content.
 */
export function unfence(text: string): string {
	const m = /^\s*(`{3,}|~{3,})\s*(?:json|markdown|md|text)?\s*\n([\s\S]*?)\n\s*\1\s*$/i.exec(text);
	return m ? m[2] : text.trim();
}
