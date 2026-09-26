import { env } from "cloudflare:workers";

// Spotify Web API for the /uses SOUNDTRACK section. Auth is a long-lived
// refresh token for the site owner's account (see scripts/spotify-auth.mjs).
// Every getter returns null / [] when Spotify is unconfigured or fails, so the
// page falls back to the CMS `tracks` and `playlists` entries.

export type SpotifyTrack = {
	title: string;
	artist: string;
	album: string;
	/** Album art URL, ~300px. */
	cover: string | null;
	/** Small album art URL, ~64px. */
	thumb: string | null;
	url: string | null;
	/** Duration in seconds. */
	s: number;
};

export type NowPlaying = SpotifyTrack & {
	playing: boolean;
	/** Playback position in seconds at `fetchedAt`. */
	progress: number;
	/** Epoch ms when Spotify was asked; the client interpolates from here. */
	fetchedAt: number;
	/** ISO time of the last play, when nothing is playing. */
	playedAt: string | null;
};

export type SpotifyPlaylist = {
	name: string;
	cover: string | null;
	url: string;
	/** "142 tracks · 9h 31m"; only the count for playlists you don't own. */
	meta: string | null;
};

type Image = { url: string; width: number | null };
type ApiTrack = {
	type?: string;
	name: string;
	duration_ms: number;
	artists?: Array<{ name: string }>;
	album?: { name: string; images?: Image[] };
	external_urls?: { spotify?: string };
};

const API = "https://api.spotify.com/v1";

let token: { value: string; expires: number } | null = null;

function secrets() {
	const e = env as unknown as Record<string, string | undefined>;
	const id = e.SPOTIFY_CLIENT_ID;
	const secret = e.SPOTIFY_CLIENT_SECRET;
	const refresh = e.SPOTIFY_REFRESH_TOKEN;
	return id && secret && refresh ? { id, secret, refresh } : null;
}

async function getAccessToken(): Promise<string | null> {
	if (token && token.expires > Date.now()) return token.value;
	const s = secrets();
	if (!s) return null;
	const res = await fetch("https://accounts.spotify.com/api/token", {
		method: "POST",
		headers: {
			Authorization: `Basic ${btoa(`${s.id}:${s.secret}`)}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: s.refresh }),
	});
	if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
	const data = (await res.json()) as { access_token: string; expires_in: number };
	token = { value: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
	return token.value;
}

/** GET an API path. `null` for 204 No Content. */
async function api<T>(path: string): Promise<T | null> {
	const access = await getAccessToken();
	if (!access) return null;
	const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${access}` } });
	if (res.status === 204) return null;
	if (!res.ok) throw new Error(`${path}: ${res.status}`);
	return (await res.json()) as T;
}

/**
 * Memoise `fn` in the Workers Cache API for `ttl` seconds so visitors don't
 * turn into Spotify requests. Without a cache (tests, odd runtimes) it just runs.
 */
async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
	const cache = typeof caches !== "undefined" ? (caches as unknown as { default?: Cache }).default : undefined;
	const req = new Request(`https://spotify.cache/${encodeURIComponent(key)}`);
	const hit = await cache?.match(req).catch(() => undefined);
	if (hit) return (await hit.json()) as T;
	const value = await fn();
	await cache
		?.put(req, new Response(JSON.stringify(value), { headers: { "Cache-Control": `max-age=${ttl}` } }))
		.catch(() => undefined);
	return value;
}

/** Run a Spotify call, logging and swallowing failures into `fallback`. */
async function safely<T>(what: string, fallback: T, fn: () => Promise<T>): Promise<T> {
	if (!secrets()) return fallback;
	try {
		return await fn();
	} catch (err) {
		console.warn(`[spotify] ${what}:`, err);
		return fallback;
	}
}

/** Smallest image at least `min` px wide (Spotify lists them largest first). */
function pickImage(images: Image[] | undefined, min: number): string | null {
	if (!images?.length) return null;
	const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
	return (sorted.find((i) => (i.width ?? 0) >= min) ?? sorted[sorted.length - 1]).url;
}

function toTrack(t: ApiTrack): SpotifyTrack {
	return {
		title: t.name,
		artist: (t.artists ?? []).map((a) => a.name).join(", "),
		album: t.album?.name ?? "",
		cover: pickImage(t.album?.images, 300),
		thumb: pickImage(t.album?.images, 64),
		url: t.external_urls?.spotify ?? null,
		s: Math.round(t.duration_ms / 1000),
	};
}

/** The current track, or the last played one when Spotify is idle. */
export function getNowPlaying(): Promise<NowPlaying | null> {
	return safely("now playing", null, () =>
		cached("now-playing", 20, async () => {
			const fetchedAt = Date.now();
			const current = await api<{ is_playing: boolean; progress_ms: number | null; item: ApiTrack | null }>(
				"/me/player/currently-playing",
			);
			if (current?.item && current.item.type !== "episode") {
				return {
					...toTrack(current.item),
					playing: current.is_playing,
					progress: Math.round((current.progress_ms ?? 0) / 1000),
					fetchedAt,
					playedAt: null,
				};
			}
			const recent = await api<{ items: Array<{ track: ApiTrack; played_at: string }> }>(
				"/me/player/recently-played?limit=1",
			);
			const last = recent?.items[0];
			if (!last) return null;
			return { ...toTrack(last.track), playing: false, progress: 0, fetchedAt, playedAt: last.played_at };
		}),
	);
}

/** Most played tracks of the last ~4 weeks. */
export function getTopTracks(limit = 5): Promise<SpotifyTrack[]> {
	return safely("top tracks", [], () =>
		cached(`top-tracks-${limit}`, 3600, async () => {
			const res = await api<{ items: ApiTrack[] }>(`/me/top/tracks?time_range=short_term&limit=${limit}`);
			return (res?.items ?? []).map(toTrack);
		}),
	);
}

/** Playlist id from an open.spotify.com URL or a spotify:playlist: URI. */
export function playlistId(url: string | null | undefined): string | null {
	return url?.match(/playlist[/:]([A-Za-z0-9]+)/)?.[1] ?? null;
}

function formatTotal(count: number, ms: number): string {
	const tracks = `${count} track${count === 1 ? "" : "s"}`;
	if (!ms) return tracks;
	const min = Math.round(ms / 60000);
	return `${tracks} · ${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}

/**
 * Name, cover and "N tracks · Xh Ym" for a playlist. Since the February 2026
 * API changes Spotify only returns `items` for playlists the user owns, so
 * other playlists get name and cover only.
 */
export function getPlaylist(url: string | null | undefined): Promise<SpotifyPlaylist | null> {
	const id = playlistId(url);
	if (!id) return Promise.resolve(null);
	return safely(`playlist ${id}`, null, () =>
		cached(`playlist-${id}`, 6 * 3600, async () => {
			const p = await api<{
				name: string;
				images?: Image[] | null;
				external_urls?: { spotify?: string };
				items?: { total: number };
			}>(`/playlists/${id}?fields=name,images,external_urls,items(total)`);
			if (!p) return null;

			let meta: string | null = null;
			if (p.items?.total != null) {
				let ms = 0;
				let next: string | null = `/playlists/${id}/items?fields=next,items(item(duration_ms))&limit=50`;
				for (let page = 0; next && page < 20; page++) {
					const res: { next: string | null; items: Array<{ item: { duration_ms?: number } | null }> } | null =
						await api(next);
					for (const i of res?.items ?? []) ms += i.item?.duration_ms ?? 0;
					next = res?.next ? res.next.replace(API, "") : null;
				}
				meta = formatTotal(p.items.total, ms);
			}

			return {
				name: p.name,
				cover: pickImage(p.images ?? undefined, 64),
				url: p.external_urls?.spotify ?? `https://open.spotify.com/playlist/${id}`,
				meta,
			};
		}),
	);
}
