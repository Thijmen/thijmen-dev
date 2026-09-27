/**
 * Cloudflare's model catalog (developers.cloudflare.com/ai/models), reduced
 * to the text-generation models the writer can call through `env.AI`. There
 * is no catalog API, so this parses the docs page's Markdown. Dependency-free:
 * `scripts/sync-catalog.ts` uses it to refresh the bundled snapshot.
 */

export const CATALOG_URL = "https://developers.cloudflare.com/ai/models/index.md";

export type CatalogModel = {
	/** What `env.AI.run` takes: `@cf/<author>/<model>` or `<provider>/<model>`. */
	id: string;
	/** Display name of the author/provider, e.g. "Anthropic". */
	provider: string;
	/** Hosted on Workers AI (`@cf/…`) vs third-party through AI Gateway. */
	hosted: boolean;
	description: string;
};

// One catalog card: "<h3>name</h3>\n\n<Author><Task> <description>](…/ai/models/<id>/)\n\n- Third-party|Cloudflare-hosted"
const CARD = /<h3>[^<]+<\/h3>\s*\n\s*\n([^\n]*?)\]\(https:\/\/developers\.cloudflare\.com\/ai\/models\/([^)\s]+?)\/\)\s*\n\s*\n- (Third-party|Cloudflare-hosted)/g;
const TASK = "Text Generation";

export function parseCatalog(markdown: string): CatalogModel[] {
	const models: CatalogModel[] = [];
	const seen = new Set<string>();
	for (const match of markdown.matchAll(CARD)) {
		const [, line, id, where] = match;
		const at = line.indexOf(TASK);
		if (at <= 0 || seen.has(id) || !/^(@cf\/)?[\w.-]+\/[\w.:-]+$/.test(id)) continue;
		seen.add(id);
		models.push({
			id,
			provider: line.slice(0, at).trim(),
			hosted: where === "Cloudflare-hosted",
			description: line.slice(at + TASK.length).trim().slice(0, 220),
		});
	}
	return models;
}
