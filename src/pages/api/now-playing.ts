import type { APIRoute } from "astro";
import { getNowPlaying } from "../../lib/spotify";

export const prerender = false;

// Polled by the /uses player. getNowPlaying() is edge-cached for 20s, so
// however many tabs poll, Spotify sees at most a few requests a minute.
export const GET: APIRoute = async () => {
	const track = await getNowPlaying();
	return Response.json(track, {
		headers: { "Cache-Control": "public, max-age=15" },
	});
};
