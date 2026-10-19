/**
 * Mermaid diagrams rendered to SVG on the server with beautiful-mermaid: no
 * DOM, no client JS, and the page cache keeps the result. Its colours are CSS
 * variables, so they follow the site tokens and switch with the theme without
 * a re-render.
 *
 * Supported: flowchart/graph, stateDiagram, sequenceDiagram, classDiagram,
 * erDiagram and xychart. Anything else returns null and the caller shows the
 * source as code.
 *
 * The SVG is inlined, so its own <style> would apply to the whole page (it
 * styles `svg` and `text`, and @imports fonts from Google). That block is
 * rewritten here: imports and font rules dropped (Diagram.astro sets the
 * site's fonts), every selector scoped to this diagram's id. Marker ids get
 * the same prefix so two diagrams on a page don't share them.
 */
import { renderMermaidSVG } from "beautiful-mermaid";

// Token colours; the rest are derived from these with color-mix().
const COLORS = {
	bg: "var(--color-surface)",
	fg: "var(--color-text)",
	accent: "var(--color-brand)",
	muted: "var(--color-muted)",
	// Nodes on the page colour, so they stand out from the window.
	surface: "var(--color-bg)",
	border: "var(--color-border)",
};

// Pages re-render on every cache miss; most diagrams don't change between them.
const memo = new Map<string, string | null>();
const MEMO_MAX = 64;

/** Inline SVG for a Mermaid source, or null when it can't be rendered. */
export function renderDiagram(source: string): string | null {
	const code = source.trim();
	if (!code) return null;
	if (memo.has(code)) return memo.get(code)!;

	let svg: string | null;
	try {
		svg = scope(renderMermaidSVG(code, { ...COLORS, font: "Geist", transparent: true, padding: 24 }), `mmd-${hash(code)}`);
	} catch (err) {
		console.warn("[diagram] render failed:", err instanceof Error ? err.message : err);
		svg = null;
	}

	if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!);
	memo.set(code, svg);
	return svg;
}

function scope(svg: string, id: string): string {
	return (
		svg
			// Give the root an id to scope the rules to.
			.replace(/^<svg /, `<svg id="${id}" class="mermaid-svg" `)
			.replace(/<style>([\s\S]*?)<\/style>/g, (_, css: string) => `<style>${scopeCss(css, id)}</style>`)
			// Unique marker / gradient ids.
			.replace(/ id="(?!mmd-)([^"]+)"/g, ` id="${id}-$1"`)
			.replace(/url\(#([^)]+)\)/g, `url(#${id}-$1)`)
	);
}

function scopeCss(css: string, id: string): string {
	return (
		css
			.replace(/@import\s+url\([^)]*\)[^;]*;/g, "")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			// Flat `selectors { declarations }` rules only; that's all it emits.
			.replace(/([^{}]+)\{([^{}]*)\}/g, (_, selectors: string, body: string) => {
				const list = selectors.split(",").map((s) => s.trim()).filter(Boolean);
				// Fonts come from the site's stylesheet.
				if (list.every((s) => s === "text" || s === ".mono") && /font-family/.test(body)) return "";
				const scoped = list.map((s) => (s === "svg" ? `#${id}` : s.startsWith("svg ") ? `#${id}${s.slice(3)}` : `#${id} ${s}`));
				return `${scoped.join(",")}{${body.trim()}}`;
			})
			.replace(/\s+/g, " ")
	);
}

/** FNV-1a, as a short base-36 string. */
function hash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return (h >>> 0).toString(36);
}
