import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import react from "@astrojs/react";
import { access, d1, r2 } from "@emdash-cms/cloudflare";
import { aiWriter } from "@thijmen/plugin-ai-writer";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
	output: "server",
	// Workers AI (ai-writer plugin) only runs remotely, and wrangler's remote
	// proxy sits behind Cloudflare Access. Plain `pnpm dev` stays local and
	// boots anywhere; `pnpm dev:ai` opts in (Access login in the browser, or
	// CLOUDFLARE_ACCESS_CLIENT_ID/SECRET for a service token).
	adapter: cloudflare({ remoteBindings: process.env.DEV_REMOTE_AI === "1" }),
	// Workers Cache in front of the Worker. Pages tag themselves through
	// Astro.cache (src/middleware.ts sets the default TTL) and EmDash purges
	// those tags whenever content, menus or settings change.
	cache: { provider: cacheCloudflare() },
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
			// Workers Builds applies core migrations before deploying
			// (`deploy:prod` / `deploy:preview`); the Worker only verifies them
			// and returns 503 while any are pending. Dev still auto-migrates.
			migrations: { runtime: "check", dev: "auto" },
			// Public HTML is shared through Workers Cache, so it must not depend on
			// who's asking. An "Edit" pill (logged-in browsers only) reloads the
			// page with ?_edit, which renders fresh with the full toolbar.
			toolbar: "client",
			// Cloudflare Access (Zero Trust) is the exclusive auth method in
			// production — passkeys, magic links and invites are disabled there.
			// With Access configured, no passkey routes exist, so /admin/login
			// loops in dev. Log in locally via
			// /_emdash/api/setup/dev-bypass?content=0&redirect=/_emdash/admin
			// (dev-only; creates a dev@emdash.local admin session).
			auth: access({
				teamDomain: "thijmen.cloudflareaccess.com",
				audienceEnvVar: "CF_ACCESS_AUDIENCE",
				defaultRole: 50, // Admin — the Access policy itself restricts who gets in
			}),
			// Writes whole entries from a brief with Workers AI (plugins/ai-writer).
			plugins: [aiWriter()],
		}),
	],
	redirects: {
		"/work": "/projects",
		"/about": "/resume",
		"/contact": "/",
	},
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Newsreader",
			cssVariable: "--font-heading",
			weights: [400, 500],
			styles: ["normal", "italic"],
			fallbacks: ["serif"],
			// Serve the optical-size axis: without it Google sends the static
			// 16pt text cut, which looks heavy at display sizes. The browser
			// picks the cut per font-size (font-optical-sizing: auto).
			options: { experimental: { variableAxis: { opsz: [["6", "72"]] } } },
		},
		{
			provider: fontProviders.google(),
			name: "Geist",
			cssVariable: "--font-body",
			weights: [400, 500, 600],
			fallbacks: ["sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500, 700],
			fallbacks: ["monospace"],
		},
	],
	devToolbar: { enabled: false },
});
