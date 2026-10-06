import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { routeWriterAgent, WriterAgent } from "@thijmen/plugin-ai-writer/agent";

export { PluginBridge, WriterAgent };

export default {
	...handler,
	// The AI writer's agent (/agents/writer-agent/<session>) is served before EmDash,
	// after EmDash confirms the caller is a logged-in editor.
	async fetch(request, env, ctx) {
		const emdash = (req: Request) => handler.fetch!(req, env, ctx);
		const agent = await routeWriterAgent(request, env, emdash);
		return agent ? noStore(agent) : emdash(request);
	},
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler<Env>;

/**
 * Workers Cache sits in front of this Worker and keeps a 200 without cache
 * headers for 2 hours, serving it without running the editor check. Astro
 * marks its own responses `no-store` unless a page opted in; agent responses
 * never pass through Astro, so mark them here. A WebSocket upgrade (101)
 * bypasses the cache and can't be copied.
 */
function noStore(response: Response): Response {
	if (response.status === 101) return response;
	const res = new Response(response.body, response);
	res.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
	return res;
}
