/**
 * Mermaid diagrams rendered to SVG on the server with beautiful-mermaid: no
 * DOM, no client JS, and the page cache keeps the result. Its colours are CSS
 * variables on the site tokens, so the theme toggle needs no re-render.
 *
 * Supported: flowchart/graph, stateDiagram, sequenceDiagram, classDiagram,
 * erDiagram and xychart. Anything else returns null and the caller shows the
 * source as code.
 *
 * Lighting. The diagram sits in a window that is dark in both themes, and is
 * lit from above: nodes fade from a bright top rim down into the window,
 * edges brighten towards their arrowheads, and `A:::accent` (or
 * `class A accent`) lights a flowchart node in the brand purple.
 * Explicit `style` / `classDef` colours are left alone. Diagram.astro adds
 * the light behind it.
 *
 * The SVG is inlined, so its own <style> would apply to the whole page (it
 * styles `svg` and `text`, and @imports fonts from Google). That block is
 * rewritten here: imports and font rules dropped (Diagram.astro sets the
 * site's fonts), every selector scoped to this diagram's id. Marker and
 * gradient ids get the same prefix so two diagrams on a page don't share them.
 */
import { renderMermaidSVG } from "beautiful-mermaid";

// The window's fixed-dark tokens; the rest are derived with color-mix().
const COLORS = {
	// The window itself: edge-label chips and hollow markers cut the line with it.
	bg: "var(--dark-tile)",
	fg: "var(--dark-ink)",
	line: "color-mix(in oklab, var(--dark-ink-2) 55%, transparent)",
	accent: "var(--color-brand)",
	muted: "var(--dark-ink-2)",
	surface: "var(--dark-tile-2)",
	border: "color-mix(in oklab, var(--dark-ink) 12%, transparent)",
};

const stop = (offset: number, color: string) => `<stop offset="${offset}" style="stop-color:${color}"/>`;
const vertical = (id: string, ...stops: string[]) =>
	`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.join("")}</linearGradient>`;

const LIGHT_DEFS = [
	// Node fill: a touch brighter at the top.
	vertical("lit", stop(0, "color-mix(in oklab, var(--dark-tile-2), var(--dark-ink) 9%)"), stop(1, "var(--dark-tile-2)")),
	// Node rim: the light catches the top edge and fades down the sides.
	vertical(
		"rim",
		stop(0, "color-mix(in oklab, var(--dark-ink) 34%, transparent)"),
		stop(0.45, "color-mix(in oklab, var(--dark-ink) 10%, transparent)"),
		stop(1, "color-mix(in oklab, var(--dark-ink) 5%, transparent)"),
	),
	vertical(
		"lit-accent",
		stop(0, "color-mix(in oklab, var(--color-field) 80%, var(--dark-tile-2))"),
		stop(1, "color-mix(in oklab, var(--color-field) 45%, var(--dark-tile))"),
	),
	vertical("rim-accent", stop(0, "var(--color-brand)"), stop(1, "color-mix(in oklab, var(--color-brand) 25%, transparent)")),
	`<filter id="glow" x="-50%" y="-80%" width="200%" height="260%"><feDropShadow dx="0" dy="6" stdDeviation="12" style="flood-color:var(--color-field);flood-opacity:0.55"/></filter>`,
	// In user space: a flat line has no box height to blur into.
	`<filter id="blur" filterUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%"><feGaussianBlur stdDeviation="4"/></filter>`,
].join("");

// Scoped like the library's own rules, and placed after them, so these win.
// No commas inside selectors: scopeCss splits selector lists on them.
const LIGHT_CSS = `
svg {
	--_node-fill: url(#lit);
	--_group-fill: color-mix(in oklab, var(--dark-ink) 3%, transparent);
	--_group-hdr: transparent;
	/* ER key badges (PK, FK): translucent, so they show on the lit fill. */
	--_key-badge: color-mix(in oklab, var(--dark-ink) 14%, transparent);
	--_accent-fill: url(#lit-accent);
	--_accent-rim: url(#rim-accent);
	/* xychart series after the first: purple shades and a neutral, not the library's blue. */
	--xychart-color-1: color-mix(in oklab, var(--color-brand), var(--dark-ink) 60%);
	--xychart-color-2: var(--color-field);
	--xychart-color-3: var(--dark-ink-2);
}

/* Rims on closed shapes only: a gradient on a straight line has no box to span. */
.node > rect[stroke="var(--_node-stroke)"],
.node > polygon[stroke="var(--_node-stroke)"],
.node > circle[stroke="var(--_node-stroke)"],
.node > path[stroke="var(--_node-stroke)"],
.actor > rect,
.class-node > rect[fill="var(--_node-fill)"],
.entity > rect[fill="var(--_node-fill)"],
rect.activation { stroke: url(#rim); stroke-width: 1px; }

.node[data-shape="rectangle"] > rect,
.actor > rect,
.class-node > rect[fill="var(--_node-fill)"],
.entity > rect[fill="var(--_node-fill)"] { rx: 10px; ry: 10px; }
.node[data-shape="rounded"] > rect { rx: 14px; ry: 14px; }

.node > [fill="var(--_accent-fill)"] { filter: url(#glow); stroke-width: 1px; }

/* Header bands: the lit top edge is the header now. */
rect[fill="var(--_group-hdr)"] { stroke: none; }

.edge-label > rect { rx: 9px; ry: 9px; }

.subgraph > rect[fill="var(--_group-fill)"] {
	rx: 14px; ry: 14px;
	stroke: color-mix(in oklab, var(--dark-ink) 14%, transparent);
	stroke-dasharray: 4 4;
}

/* Sequence diagrams. */
.lifeline { stroke: color-mix(in oklab, var(--dark-ink) 16%, transparent); }
.block > rect[fill="none"] { rx: 6px; ry: 6px; stroke-dasharray: 4 4; }
.block > rect[fill="var(--_group-hdr)"] { fill: color-mix(in oklab, var(--dark-ink) 8%, transparent); rx: 6px; ry: 6px; }
.note > polygon { fill: var(--color-brand-soft); stroke: none; }
.note > polygon + polygon { fill: color-mix(in oklab, var(--color-brand) 35%, var(--color-brand-soft)); }
.note text { fill: var(--_text); }

/* xychart: lines glow instead of casting a shadow. */
.xychart-bar { stroke-width: 1px; }
.xychart-line-shadow { opacity: 0.45; stroke-width: 7px; filter: url(#blur); transform: none; }
`;

// Lights a node when the source uses the `accent` class without defining it.
const ACCENT_CLASS = "classDef accent fill:var(--_accent-fill),stroke:var(--_accent-rim)";

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
		const raw = renderMermaidSVG(withAccent(code), { ...COLORS, font: "Geist", transparent: true, padding: 24 });
		svg = scope(light(raw, /^\s*xychart(-beta)?\s+horizontal\b/m.test(code)), `mmd-${hash(code)}`);
	} catch (err) {
		console.warn("[diagram] render failed:", err instanceof Error ? err.message : err);
		svg = null;
	}

	if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value!);
	memo.set(code, svg);
	return svg;
}

/** Adds the accent classDef to flowcharts that use it (state diagrams ignore classes). */
function withAccent(code: string): string {
	const header = code.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("%%")) ?? "";
	if (!/^(graph|flowchart)\b/.test(header)) return code;
	const uses = /:::accent\b/.test(code) || /^\s*class\s+[\w,-]+\s+accent\s*;?\s*$/m.test(code);
	const defines = /^\s*classDef\s+accent\b/m.test(code);
	return uses && !defines ? `${code}\n${ACCENT_CLASS}` : code;
}

/** Adds the lighting: gradients, the glow, and the rules that use them. */
function light(svg: string, horizontal: boolean): string {
	const defs: string[] = [LIGHT_DEFS];
	let css = LIGHT_CSS;

	// Edges brighten towards their arrowheads. One user-space gradient per
	// edge, from its first point to its last; styled edges keep their colour.
	let edges = 0;
	svg = svg.replace(/<(polyline|line) ([^>]*?)\/>/g, (tag, el: string, attrs: string) => {
		if (!attrs.includes('stroke="var(--_line)"')) return tag;
		const toEnd = attrs.includes("marker-end=");
		const toStart = attrs.includes("marker-start=");
		if (!toEnd && !toStart) return tag;

		const points = el === "line" ? [[attr(attrs, "x1"), attr(attrs, "y1")], [attr(attrs, "x2"), attr(attrs, "y2")]] : polyPoints(attrs);
		const [a, b] = [points[0], points[points.length - 1]];
		if (!a || !b || a.some(Number.isNaN) || b.some(Number.isNaN) || Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) return tag;

		const dim = "var(--_line)";
		const lit = "var(--_arrow)";
		const stops = toStart && toEnd ? [stop(0, lit), stop(0.5, dim), stop(1, lit)] : toEnd ? [stop(0, dim), stop(1, lit)] : [stop(0, lit), stop(1, dim)];
		const id = `flow-${edges++}`;
		defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}">${stops.join("")}</linearGradient>`);
		return tag.replace('stroke="var(--_line)"', `stroke="url(#${id})"`);
	});

	// xychart bars: each series fades from its colour at the bar's end.
	const series = new Set([...svg.matchAll(/xychart-color-(\d+)/g)].map((m) => m[1]));
	const [x1, y1, x2, y2] = horizontal ? [1, 0, 0, 0] : [0, 0, 0, 1];
	for (const n of series) {
		defs.push(
			`<linearGradient id="bar-${n}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
				stop(0, `color-mix(in oklab, var(--xychart-color-${n}) 60%, transparent)`) +
				stop(1, `color-mix(in oklab, var(--xychart-color-${n}) 14%, transparent)`) +
				`</linearGradient>`,
		);
		css += `.xychart-bar.xychart-color-${n} { fill: url(#bar-${n}); }\n`;
	}

	return svg.replace(/<\/svg>\s*$/, `<style>${css}</style>\n<defs>${defs.join("")}</defs>\n</svg>`);
}

function attr(attrs: string, name: string): number {
	return Number(new RegExp(`\\b${name}="([^"]+)"`).exec(attrs)?.[1]);
}

function polyPoints(attrs: string): number[][] {
	const list = /\bpoints="([^"]+)"/.exec(attrs)?.[1] ?? "";
	return list.trim().split(/\s+/).map((p) => p.split(",").map(Number));
}

function scope(svg: string, id: string): string {
	return (
		svg
			// Give the root an id to scope the rules to.
			.replace(/^<svg /, `<svg id="${id}" class="mermaid-svg" `)
			.replace(/<style>([\s\S]*?)<\/style>/g, (_, css: string) => `<style>${scopeCss(css, id)}</style>`)
			// Unique marker / gradient / filter ids.
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
