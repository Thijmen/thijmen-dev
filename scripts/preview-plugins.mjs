import { execFileSync } from "node:child_process";

/**
 * Sandboxed plugins that run on preview deploys only: the registry edition of
 * the AI writer (plugins/ai-writer-lite), to try it in EmDash's real plugin
 * sandbox before it's published. Workers Builds sets WORKERS_CI_BRANCH on
 * every build; production builds from `main` and gets none of this.
 *
 * The plugin's dist/ is build output (gitignored), so it's built here first.
 * The Worker Loader binding the sandbox needs is in wrangler.jsonc `previews`.
 */
export async function previewSandboxedPlugins() {
	const branch = process.env.WORKERS_CI_BRANCH;
	if (!branch || branch === "main") return [];
	execFileSync("pnpm", ["--filter", "@thijmen/plugin-ai-writer-lite", "run", "build"], { stdio: "inherit" });
	const { default: aiWriterLite } = await import("@thijmen/plugin-ai-writer-lite");
	return [aiWriterLite];
}
