import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { routeWriterAgent, WriterAgent } from "@thijmen/plugin-ai-writer/agent";

export { PluginBridge, WriterAgent };

export default {
	...handler,
	// The AI writer's agent (/agents/writer-agent/<session>) is served before EmDash.
	async fetch(request, env, ctx) {
		return (await routeWriterAgent(request, env)) ?? handler.fetch!(request, env, ctx);
	},
	scheduled: createScheduledHandler(),
} satisfies ExportedHandler<Env>;
