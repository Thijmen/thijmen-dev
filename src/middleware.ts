import { defineMiddleware } from "astro:middleware";

/**
 * Edge TTL for HTML pages that don't set their own. Publishing purges a page
 * through its cache tags right away (EmDash calls cache.invalidate()), so this
 * only bounds what tags can't see: a purge dropped by the rate limit, the
 * footer year. Soundtrack asks for 30s itself (Spotify data).
 */
const PAGE_CACHE = { maxAge: 3600, swr: 86400 };

export const onRequest = defineMiddleware(async (context, next) => {
	const response = await next();
	const { cache } = context;
	if (!cache?.enabled || !response.headers.get("content-type")?.startsWith("text/html")) return response;
	// Astro streams pages: the response exists before Base and the components
	// in it render, so their Astro.cache.set() calls (profile, menu, latest
	// post, blocks, Soundtrack's TTL) would miss the headers. Buffer the page
	// so every hint is in before Astro writes Cache-Tag.
	const html = await response.text();
	if (cache.tags.length > 0 && cache.options.maxAge === undefined) cache.set(PAGE_CACHE);
	return new Response(html, response);
});
