import type { PluginDescriptor } from "emdash";

/**
 * AI writer: a live writing agent (Durable Object on Workers AI) with a React
 * admin page, plus a quick one-shot fill in the editor panel. Needs the `AI`
 * binding, the `WriterAgent` Durable Object and `routeWriterAgent` in
 * src/worker.ts. Runtime: ./runtime.ts, agent: ./agent, UI: ./admin.
 */
export function aiWriter(): PluginDescriptor {
	return {
		id: "ai-writer",
		version: "0.2.0",
		format: "native",
		entrypoint: "@thijmen/plugin-ai-writer/runtime",
		adminEntry: "@thijmen/plugin-ai-writer/admin",
	};
}
