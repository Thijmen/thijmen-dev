import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { routeWriterAgent, WriterAgent } from "@thijmen/plugin-ai-writer/agent";

export { PluginBridge, WriterAgent };

export default {
	...handler,
	// The AI writer's agent (/agents/writer-agent/<session>) is served before EmDash,
	// after EmDash confirms the caller is a logged-in editor.
	async fetch(request, env, ctx) {
		const emdash = (req: Request) => handler.fetch!(req, env, ctx);
		return (await routeWriterAgent(request, env, emdash)) ?? emdash(request);
	},
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler<Env>;
