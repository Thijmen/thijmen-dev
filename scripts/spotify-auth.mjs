// One-off: authorise the site's Spotify app against your account and print a
// refresh token for SPOTIFY_REFRESH_TOKEN.
//
//   1. Add http://127.0.0.1:8888/callback as a redirect URI in the Spotify
//      developer dashboard.
//   2. SPOTIFY_CLIENT_ID=… SPOTIFY_CLIENT_SECRET=… node scripts/spotify-auth.mjs
//   3. Open the printed URL, approve, copy the token from the terminal.
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) {
	console.error("Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.");
	process.exit(1);
}

const redirect = "http://127.0.0.1:8888/callback";
const scope = "user-read-currently-playing user-read-recently-played user-top-read playlist-read-private";
const state = randomBytes(16).toString("hex");

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", redirect);
	if (url.pathname !== "/callback") return res.writeHead(404).end();
	if (url.searchParams.get("state") !== state) return res.writeHead(400).end("state mismatch");
	const code = url.searchParams.get("code");
	if (!code) return res.writeHead(400).end(url.searchParams.get("error") ?? "no code");

	const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
		method: "POST",
		headers: {
			Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect }),
	});
	const data = await tokenRes.json();
	if (!tokenRes.ok || !data.refresh_token) {
		res.writeHead(500).end("token exchange failed, see terminal");
		console.error(data);
	} else {
		res.end("Done. Back to the terminal.");
		console.log(`\nSPOTIFY_REFRESH_TOKEN=${data.refresh_token}\n`);
		console.log(`Scopes granted: ${data.scope}`);
	}
	server.close();
});

server.listen(8888, "127.0.0.1", () => {
	const auth = new URL("https://accounts.spotify.com/authorize");
	auth.search = new URLSearchParams({ client_id: id, response_type: "code", redirect_uri: redirect, scope, state }).toString();
	console.log(`Open this URL and approve:\n\n${auth}\n`);
});
