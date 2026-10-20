/**
 * Halftone covers: deterministic dot-screen art for posts without an
 * uploaded `featured_image`. Server-side only (no client JS): the slug seeds
 * the art, the post's rarest tag picks the shape and the hue, and the SVG is
 * coloured through CSS (`--hue`), so the theme toggle needs no re-render.
 *
 * Every post owns one fixed piece of art: a 2.4:1 field. Covers show the
 * whole field (cropped by `preserveAspectRatio="xMidYMid slice"`); thumbnails
 * zoom into the art's focus point, so a post looks the same everywhere.
 */

/** Art-space aspect: the field is A wide and 1 tall. */
const A = 2.4;

export type CoverShape = "attention" | "ripples" | "graph" | "contours";
export type CoverHue = "purple" | "green" | "blue" | "orange";
export type CoverVariant = "hero" | "card" | "thumb";

type Art = { f: (u: number, v: number, cell?: number) => number; focus: { x: number; y: number } };

const fnv = (s: string) => {
	let h = 2166136261 >>> 0;
	for (const c of s) h = Math.imul(h ^ c.codePointAt(0)!, 16777619) >>> 0;
	return h;
};

const mulberry = (a: number) => () => {
	a = (a + 0x6d2b79f5) >>> 0;
	let t = a;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const smooth = (a: number, b: number, x: number) => {
	const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

const vnoise = (rnd: () => number) => {
	const N = 64;
	const g = Array.from({ length: N * N }, rnd);
	const at = (x: number, y: number) => g[(((y % N) + N) % N) * N + (((x % N) + N) % N)];
	const s = (t: number) => t * t * (3 - 2 * t);
	return (x: number, y: number) => {
		const xi = Math.floor(x);
		const yi = Math.floor(y);
		const xf = s(x - xi);
		const yf = s(y - yi);
		const a = at(xi, yi);
		const b = at(xi + 1, yi);
		const c = at(xi, yi + 1);
		const d = at(xi + 1, yi + 1);
		return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
	};
};

const SHAPES: Record<CoverShape, (rnd: () => number) => Art> = {
	// #llm: attention. Tokens on a baseline; arcs join the ones that attend to each other.
	// Arcs never cross (nested, like a parse), short ones heavy, long ones light.
	attention(rnd) {
		const base = 0.8;
		const n = 12 + Math.floor(rnd() * 3);
		const xs = Array.from({ length: n }, (_, i) => 0.2 + ((A - 0.4) * i) / (n - 1));
		const arcs: Array<{ i: number; j: number; c: number; r: number; w: number }> = [];
		const crosses = (i: number, j: number) =>
			arcs.some((a) => (a.i < i && i < a.j && a.j < j) || (i < a.i && a.i < j && j < a.j) || a.i === i || a.j === j);
		for (let k = 0; arcs.length < 8 && k < 400; k++) {
			const i = Math.floor(rnd() * (n - 1));
			const j = i + 1 + Math.floor(rnd() * Math.min(n - 1 - i, 8));
			const r = (xs[j] - xs[i]) / 2;
			if (j >= n || r > 0.68 || crosses(i, j)) continue;
			arcs.push({ i, j, c: (xs[i] + xs[j]) / 2, r, w: Math.max(0.25, 1 - (j - i - 1) * 0.16) });
		}
		const f = (u: number, v: number, cell = 0) => {
			let t = 0;
			for (const x of xs) {
				const d = Math.hypot(u - x, v - base);
				if (d < 0.033) return 1;
				if (d < 0.056) t = Math.max(t, 0.4);
			}
			if (Math.abs(v - base) < Math.max(0.007, cell * 0.45)) t = Math.max(t, 0.26);
			if (v < base)
				for (const a of arcs) {
					const e = Math.abs(Math.hypot(u - a.c, v - base) - a.r);
					const wd = Math.max(0.011 + 0.015 * a.w, cell * (0.55 + 0.25 * a.w));
					if (e < wd) t = Math.max(t, (0.5 + 0.5 * a.w) * (1 - (e / wd) * 0.4));
				}
			return t;
		};
		const fit = arcs.filter((a) => a.r < 0.22).sort((p, q) => q.w - p.w)[0] || arcs[0];
		return { f, focus: fit ? { x: fit.c, y: base - 0.16 } : { x: A / 2, y: 0.6 } };
	},

	// #payments: two ripples. One request, one retry.
	ripples(rnd) {
		const a = { x: 0.78 + rnd() * 0.12, y: 0.46 + (rnd() - 0.5) * 0.12 };
		const b = { x: a.x + 0.62 + rnd() * 0.1, y: 0.54 + (rnd() - 0.5) * 0.12 };
		const lam = 0.11;
		const ring = (u: number, v: number, p: { x: number; y: number }) => {
			const d = Math.hypot(u - p.x, v - p.y);
			if (d < lam * 0.42) return 1;
			return Math.pow(0.5 + 0.5 * Math.cos((2 * Math.PI * (d - lam * 0.42)) / lam), 3) * Math.exp(-d * 1.45);
		};
		return { f: (u, v) => Math.min(1, ring(u, v, a) + ring(u, v, b)), focus: a };
	},

	// #distributed-systems: nodes and the links between them.
	graph(rnd) {
		const nodes: Array<{ x: number; y: number; r: number }> = [];
		for (let i = 0; nodes.length < 7 && i < 500; i++) {
			const p = { x: 0.18 + rnd() * (A - 0.36), y: 0.16 + rnd() * 0.68, r: 0.045 + rnd() * 0.05 };
			if (nodes.every((q) => Math.hypot(p.x - q.x, p.y - q.y) > 0.36)) nodes.push(p);
		}
		const edges = new Set<string>();
		nodes.forEach((a, i) => {
			nodes
				.map((b, j) => [Math.hypot(a.x - b.x, a.y - b.y), j] as const)
				.filter(([, j]) => j !== i)
				.sort((p, q) => p[0] - q[0])
				.slice(0, 2)
				.forEach(([, j]) => edges.add(i < j ? `${i}-${j}` : `${j}-${i}`));
		});
		const segs = [...edges]
			.map((k) => k.split("-").map(Number))
			.map(([i, j]) => [nodes[i], nodes[j]] as const);
		const f = (u: number, v: number, cell = 0) => {
			let t = 0;
			for (const p of nodes) {
				const d = Math.hypot(u - p.x, v - p.y);
				if (d < p.r) return 1;
				if (d < p.r + 0.06) t = Math.max(t, 0.55 * (1 - (d - p.r) / 0.06));
			}
			for (const [a, b] of segs) {
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const k = Math.max(0, Math.min(1, ((u - a.x) * dx + (v - a.y) * dy) / (dx * dx + dy * dy)));
				const d = Math.hypot(u - (a.x + k * dx), v - (a.y + k * dy));
				if (d < Math.max(0.022, cell * 0.6)) t = Math.max(t, 0.55);
			}
			return t;
		};
		const big = nodes.slice().sort((p, q) => q.r - p.r)[0] || { x: A / 2, y: 0.5 };
		return { f, focus: big };
	},

	// #tooling: contour lines. Distance to the nearest level line, so every line is the same width.
	contours(rnd) {
		const n = vnoise(rnd);
		const ox = rnd() * 40;
		const oy = rnd() * 40;
		const H = (u: number, v: number) => (n(u * 1.1 + ox, v * 1.1 + oy) * 0.66 + n(u * 2.2 + ox, v * 2.2 + oy) * 0.34) * 15;
		const f = (u: number, v: number, cell = 0) => {
			const e = 0.004;
			const h = H(u, v);
			const g = Math.hypot(H(u + e, v) - H(u - e, v), H(u, v + e) - H(u, v - e)) / (2 * e) || 1e-6;
			const fr = h - Math.floor(h);
			const d = Math.min(fr, 1 - fr) / g;
			const major = Math.round(h) % 3 === 0;
			const wd = Math.max(major ? 0.024 : 0.015, cell * (major ? 0.8 : 0.6));
			return d < wd ? (major ? 1 : 0.62) * (1 - smooth(0, wd, d) * 0.45) : 0;
		};
		let best = { x: A / 2, y: 0.5, s: -1 };
		for (let i = 0; i < 30; i++) {
			const x = 0.3 + rnd() * (A - 0.6);
			const y = 0.3 + rnd() * 0.4;
			let s = 0;
			for (let k = 0; k < 36; k++) s += f(x + ((k % 6) - 2.5) * 0.04, y + (Math.floor(k / 6) - 2.5) * 0.04) > 0 ? 1 : 0;
			if (s > best.s) best = { x, y, s };
		}
		return { f, focus: best };
	},
};

/** Tag → shape and hue. Rarest first: a post with several tags takes the first that matches. */
const TAGS: Array<{ tag: string; shape: CoverShape; hue: CoverHue }> = [
	{ tag: "payments", shape: "ripples", hue: "green" },
	{ tag: "tooling", shape: "contours", hue: "orange" },
	{ tag: "llm", shape: "attention", hue: "purple" },
	{ tag: "distributed-systems", shape: "graph", hue: "blue" },
];

const SHAPE_LIST = Object.keys(SHAPES) as CoverShape[];
const HUE_OF: Record<CoverShape, CoverHue> = { attention: "purple", ripples: "green", graph: "blue", contours: "orange" };

/** Which shape and hue a post gets: by its rarest known tag, else hashed from the slug. */
export function pickArt(slug: string, tags: string[] = []): { shape: CoverShape; hue: CoverHue } {
	for (const t of TAGS) if (tags.includes(t.tag)) return { shape: t.shape, hue: t.hue };
	const shape = SHAPE_LIST[fnv(slug) % SHAPE_LIST.length];
	return { shape, hue: HUE_OF[shape] };
}

// Field and dot sizes per variant, in SVG units.
const SIZES = {
	// The whole 2.4:1 field.
	field: { w: 960, h: 400, pitch: 12, zoom: 0 },
	// A square crop around the focus point: light enough for a 56px thumb.
	thumb: { w: 120, h: 120, pitch: 6.4, zoom: 0.5 },
} as const;

const num = (n: number) => {
	const s = n.toFixed(1);
	return s.endsWith(".0") ? s.slice(0, -2) : s;
};

const cache = new Map<string, string>();

/** The cover as an SVG string (a single path, filled with `var(--hue)`). */
export function coverSvg(slug: string, tags: string[] = [], variant: CoverVariant = "card"): string {
	const { shape } = pickArt(slug, tags);
	const key = `${slug}|${shape}|${variant === "thumb" ? "thumb" : "field"}`;
	const hit = cache.get(key);
	if (hit) return hit;

	const art = SHAPES[shape](mulberry(fnv(slug)));
	const { w, h, pitch, zoom } = variant === "thumb" ? SIZES.thumb : SIZES.field;
	const a = w / h;
	let x0 = 0;
	let y0 = 0;
	let span = 1; // the art window: [x0, x0 + span * a] × [y0, y0 + span]
	if (zoom) {
		span = zoom;
		x0 = Math.max(0, Math.min(A - span * a, art.focus.x - (span * a) / 2));
		y0 = Math.max(0, Math.min(1 - span, art.focus.y - span / 2));
	}
	const min = 0.07;
	const cell = (pitch / h) * span; // one dot step in art units: lines are never thinner than this
	const dy = pitch * 0.866;
	let d = "";
	let px = 0;
	let py = 0; // pen position (rounded values, so relative moves don't drift)
	for (let j = 0, y = pitch * 0.5; y < h + pitch; j++, y += dy) {
		for (let x = j % 2 ? pitch / 2 : 0; x < w + pitch; x += pitch) {
			const t = art.f(x0 + (x / h) * span, y0 + (y / h) * span, cell);
			const tt = min + (1 - min) * Math.max(0, Math.min(1, t));
			const r = Math.round(tt * pitch * 0.47 * 4) / 4;
			if (r < 0.42) continue;
			const sx = Math.round((x - r) * 10) / 10;
			const sy = Math.round(y * 10) / 10;
			const R = num(r);
			const D = num(2 * r);
			d += `${d ? "m" : "M"}${num(sx - px)} ${num(sy - py)}a${R} ${R} 0 1 0 ${D} 0a${R} ${R} 0 1 0-${D} 0`;
			px = sx;
			py = sy;
		}
	}
	const svg = `<svg class="ht" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
	cache.set(key, svg);
	return svg;
}
