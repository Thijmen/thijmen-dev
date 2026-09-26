/**
 * Short-lived HMAC tokens for the WriterAgent WebSocket. The plugin's
 * `session` route (admin session) mints one; the Worker checks it in
 * `routeAgentRequest`'s onBeforeConnect before the Durable Object sees the
 * request. Access already guards prod/preview; this makes the agent
 * reachable only from the admin, in dev too.
 */

const TTL_SECONDS = 60 * 60 * 6;
const DEV_SECRET = "ai-writer-dev-only";

/** The signing secret: AI_WRITER_SECRET, or a fixed one in `astro dev`. Null means refuse. */
export function writerSecret(env: { AI_WRITER_SECRET?: string }): string | null {
	if (env.AI_WRITER_SECRET) return env.AI_WRITER_SECRET;
	return import.meta.env.DEV ? DEV_SECRET : null;
}

export async function signToken(secret: string, session: string, now = Date.now()): Promise<string> {
	const exp = Math.floor(now / 1000) + TTL_SECONDS;
	return `${exp}.${await hmac(secret, `${session}.${exp}`)}`;
}

/** Valid when unexpired and signed for this session (the agent instance name). */
export async function verifyToken(secret: string, session: string, token: string | null, now = Date.now()): Promise<boolean> {
	if (!token) return false;
	const [expRaw, sig] = token.split(".");
	const exp = Number(expRaw);
	if (!Number.isInteger(exp) || exp * 1000 < now || !sig) return false;
	const expected = await hmac(secret, `${session}.${exp}`);
	return timingSafeEqual(sig, expected);
}

async function hmac(secret: string, data: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
	return btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
