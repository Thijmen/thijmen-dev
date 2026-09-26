import { apiFetch, parseApiResponse } from "emdash/plugin-utils";

import type { Run, SearchHit, SessionInfo } from "../runtime";

/** POST to one of this plugin's routes. Routes answer `{ error }` instead of throwing. */
async function call<T>(route: string, body: unknown, init?: { keepalive?: boolean }): Promise<T> {
	const res = await apiFetch(`/_emdash/api/plugins/ai-writer/${route}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body ?? {}),
		...init,
	});
	const data = await parseApiResponse<T | { error: string }>(res, `The ${route} request failed`);
	if (data && typeof data === "object" && "error" in data && typeof data.error === "string") throw new Error(data.error);
	return data as T;
}

export const api = {
	session: (session: string, collection: string, entryId: string | null) => call<SessionInfo>("session", { session, collection, entryId }),
	search: (input: unknown) => call<{ results: SearchHit[] }>("search", input),
	save: (collection: string, entryId: string | null, fields: Record<string, unknown>) =>
		call<{ id: string; collection: string; created: boolean }>("save", { collection, entryId, fields }),
	/** keepalive lets the request outlive a page unload. */
	logRun: (run: Partial<Run>) => call<{ ok: true }>("runs/log", run, { keepalive: true }).catch(() => undefined),
	runs: () => call<{ runs: Run[] }>("runs", {}),
};

export function editorUrl(collection: string, id: string): string {
	return `/_emdash/admin/content/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
}
