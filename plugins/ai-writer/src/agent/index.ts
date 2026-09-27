import { routeAgentRequest } from "agents";

export { WriterAgent } from "./writer-agent";

/** Headers that carry the caller's identity: the EmDash session cookie and Cloudflare Access. */
const IDENTITY_HEADERS = ["cookie", "cf-access-jwt-assertion", "authorization", "origin"];

/**
 * Route `/agents/writer-agent/<session>` to the WriterAgent Durable Object,
 * but only for someone logged in to EmDash who may edit content. This runs
 * before EmDash in src/worker.ts, so it asks EmDash itself: `emdash` is the
 * site's fetch handler, and the plugin's private `agent-access` route answers
 * 200 only after EmDash's usual auth (session cookie, or Access in prod) and
 * its `content:edit_own` permission check. Returns null for other paths.
 */
export async function routeWriterAgent(request: Request, env: Cloudflare.Env, emdash: (request: Request) => Promise<Response>): Promise<Response | null> {
	if (!new URL(request.url).pathname.startsWith("/agents/")) return null;
	const guard = async (req: Request, route: { className: string; name: string }) => {
		if (route.className !== "WriterAgent") return new Response("Not found", { status: 404 });
		return (await isEditor(req, emdash)) ? undefined : new Response("Log in to the EmDash admin first", { status: 401 });
	};
	return routeAgentRequest(request, env, { onBeforeConnect: guard, onBeforeRequest: guard });
}

async function isEditor(request: Request, emdash: (request: Request) => Promise<Response>): Promise<boolean> {
	const headers = new Headers({ "Content-Type": "application/json", "X-EmDash-Request": "1" });
	for (const name of IDENTITY_HEADERS) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}
	const probe = new Request(new URL("/_emdash/api/plugins/ai-writer/agent-access", request.url), { method: "POST", headers, body: "{}" });
	try {
		const res = await emdash(probe);
		if (!res.ok) return false;
		const json = (await res.json()) as { data?: { ok?: boolean } };
		return json.data?.ok === true;
	} catch {
		return false;
	}
}
