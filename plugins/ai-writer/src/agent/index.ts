import { routeAgentRequest } from "agents";

import { verifyToken, writerSecret } from "./token";

export { WriterAgent } from "./writer-agent";

type RouteEnv = Cloudflare.Env & { AI_WRITER_SECRET?: string };

/**
 * Route `/agents/writer-agent/<session>` to the WriterAgent Durable Object,
 * but only with a token minted by the plugin's `session` route for that
 * session. Returns null for every other path so the site handles it.
 */
export async function routeWriterAgent(request: Request, env: RouteEnv): Promise<Response | null> {
	if (!new URL(request.url).pathname.startsWith("/agents/")) return null;
	const guard = async (req: Request, route: { className: string; name: string }) => {
		if (route.className !== "WriterAgent") return new Response("Not found", { status: 404 });
		const secret = writerSecret(env);
		if (!secret) return new Response("AI_WRITER_SECRET is not set", { status: 503 });
		const ok = await verifyToken(secret, route.name, new URL(req.url).searchParams.get("token"));
		return ok ? undefined : new Response("Unauthorized", { status: 401 });
	};
	return routeAgentRequest(request, env, { onBeforeConnect: guard, onBeforeRequest: guard });
}
