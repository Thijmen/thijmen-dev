import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { access, d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
			// Cloudflare Access (Zero Trust) is the exclusive auth method in
			// production — passkeys, magic links and invites are disabled there.
			// Local dev automatically falls back to passkey login.
			auth: access({
				teamDomain: "thijmen.cloudflareaccess.com",
				audienceEnvVar: "CF_ACCESS_AUDIENCE",
				defaultRole: 50, // Admin — the Access policy itself restricts who gets in
			}),
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
