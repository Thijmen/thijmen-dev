/**
 * Syntax highlighting for post code blocks. Uses Shiki's fine-grained core
 * with a fixed set of grammars and the JavaScript regex engine, so the
 * Worker bundle doesn't ship every language (or the Oniguruma WASM) the way
 * Astro's <Code> does. Token colours come from CSS variables that
 * CodeBlock.astro maps onto the --syntax-* tokens.
 */
import { createCssVariablesTheme, createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const theme = createCssVariablesTheme({ name: "css-variables", variablePrefix: "--shiki-" });

const LANGS = {
	css: () => import("shiki/langs/css.mjs"),
	diff: () => import("shiki/langs/diff.mjs"),
	go: () => import("shiki/langs/go.mjs"),
	html: () => import("shiki/langs/html.mjs"),
	java: () => import("shiki/langs/java.mjs"),
	javascript: () => import("shiki/langs/javascript.mjs"),
	json: () => import("shiki/langs/json.mjs"),
	kotlin: () => import("shiki/langs/kotlin.mjs"),
	python: () => import("shiki/langs/python.mjs"),
	shellscript: () => import("shiki/langs/shellscript.mjs"),
	sql: () => import("shiki/langs/sql.mjs"),
	tsx: () => import("shiki/langs/tsx.mjs"),
	typescript: () => import("shiki/langs/typescript.mjs"),
	yaml: () => import("shiki/langs/yaml.mjs"),
};

const ALIASES: Record<string, keyof typeof LANGS> = {
	bash: "shellscript",
	js: "javascript",
	kt: "kotlin",
	py: "python",
	sh: "shellscript",
	shell: "shellscript",
	ts: "typescript",
	yml: "yaml",
	zsh: "shellscript",
};

let highlighter: Promise<HighlighterCore> | undefined;

function getHighlighter() {
	highlighter ??= createHighlighterCore({
		themes: [theme],
		langs: Object.values(LANGS).map((load) => load()),
		engine: createJavaScriptRegexEngine(),
	});
	return highlighter;
}

/** Highlighted <pre> HTML, or null for languages outside the bundled set. */
export async function highlight(code: string, language?: string): Promise<string | null> {
	const key = (language ?? "").toLowerCase();
	const lang = key in LANGS ? key : ALIASES[key];
	if (!lang) return null;
	const hl = await getHighlighter();
	return hl.codeToHtml(code, { lang, theme: "css-variables" });
}
