/**
 * Site-wide motion runtime, loaded once from Base.astro. The CSS half and
 * the data-motion contract are documented in styles/motion.css.
 */
const root = document.documentElement;
// Tells the boot script's DOMContentLoaded failsafe that motion is live.
root.setAttribute("data-motion-ready", "");

const reduceQuery = matchMedia("(prefers-reduced-motion: reduce)");

/** True when everything may move (no OS reduce, no `set motion=off`). */
export const motionFull = () => root.dataset.motion === "full";

/**
 * `set motion=off|on` from the palette. "on" only clears the override:
 * the OS reduced-motion setting always wins.
 */
export function applyMotionPref(pref?: "on" | "off") {
	let off = false;
	try {
		if (pref === "off") localStorage.setItem("ts-motion", "off");
		else if (pref === "on") localStorage.removeItem("ts-motion");
		off = localStorage.getItem("ts-motion") === "off";
	} catch {}
	root.dataset.motion = reduceQuery.matches || off ? "reduced" : "full";
}
reduceQuery.addEventListener("change", () => applyMotionPref());

const ms = (prop: string) => parseFloat(getComputedStyle(root).getPropertyValue(prop)) || 0;

// Scroll reveals -------------------------------------------------------
// [data-reveal] elements, children of [data-stagger] and [data-print]
// windows get .is-in the first time they enter the viewport; the CSS in
// motion.css does the rest. Each batch is staggered in document order.
// Whatever is on screen at load waits for the hero to get going first.
const REVEAL = "[data-reveal], [data-stagger] > *, [data-print], [data-count]:not(.type-out [data-count])";
const pending = new Set<Element>();
let firstBatch = true;

function reveal(el: Element, delay: number) {
	pending.delete(el);
	io.unobserve(el);
	(el as HTMLElement).style.setProperty("--reveal-delay", `${delay}ms`);
	el.classList.add("is-in");
	if (el.matches("[data-count]")) countUp(el as HTMLElement, delay);
}

const io = new IntersectionObserver(
	(entries) => {
		const base = firstBatch ? 280 : 0;
		firstBatch = false;
		const stagger = ms("--stagger");
		entries
			.filter((e) => e.isIntersecting)
			.map((e) => e.target)
			.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
			.forEach((el, i) => reveal(el, base + Math.min(i, 8) * stagger));
	},
	{ rootMargin: "0px 0px -10% 0px" },
);
document.querySelectorAll(REVEAL).forEach((el) => {
	pending.add(el);
	io.observe(el);
});

// At the very bottom nothing can scroll further into the -10% margin.
const footer = document.querySelector(".site-footer");
if (footer)
	new IntersectionObserver((entries) => {
		if (!entries.some((e) => e.isIntersecting)) return;
		[...pending].forEach((el) => {
			const r = el.getBoundingClientRect();
			if (r.top < innerHeight && r.bottom > 0) reveal(el, 0);
		});
	}).observe(footer);

/** Reveal everything at once (printing, or the tools filter showing cards). */
export function revealAll() {
	[...pending].forEach((el) => reveal(el, 0));
	document.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => counts.get(el)?.());
}
addEventListener("beforeprint", revealAll);

// Count-ups ------------------------------------------------------------
// "412", "1.2k", "48,213": counts from 0 to the server-rendered value and
// always ends on that exact string (also what no-JS and screen readers get).
const counts = new Map<HTMLElement, () => void>();

export function countUp(el: HTMLElement, delay = 0) {
	const final = el.textContent ?? "";
	const m = final.trim().match(/^(\d[\d,]*(?:\.\d+)?)([kKmM]?)$/);
	if (!m || !motionFull() || counts.has(el)) return;
	const target = parseFloat(m[1].replace(/,/g, ""));
	const decimals = m[1].split(".")[1]?.length ?? 0;
	const fmt = (v: number) =>
		(m[1].includes(",")
			? Math.round(v).toLocaleString("en-US")
			: v.toFixed(decimals)) + m[2];
	// Pin the width so growing digits don't shove the text after them.
	el.style.cssText += `display:inline-block;min-width:${el.getBoundingClientRect().width}px;text-align:right`;
	let raf = 0;
	const done = () => {
		cancelAnimationFrame(raf);
		el.textContent = final;
		el.style.removeProperty("display");
		el.style.removeProperty("min-width");
		el.style.removeProperty("text-align");
	};
	counts.set(el, done);
	el.textContent = fmt(0);
	setTimeout(() => {
		const start = performance.now();
		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / 900);
			if (t >= 1) return done();
			el.textContent = fmt(target * (1 - Math.pow(2, -10 * t)));
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
	}, delay);
}

// A typing kicker's output (`→ 8`) counts once it appears (Kicker.astro).
document.addEventListener(
	"animationstart",
	(e) => {
		const out = (e.target as Element).closest?.(".type-out");
		out?.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => countUp(el));
	},
	true,
);

// Images ---------------------------------------------------------------
// Fade in once loaded (CSS in motion.css); broken images show too.
document.querySelectorAll<HTMLImageElement>("img.cover-img, .frame img").forEach((img) => {
	const done = () => img.setAttribute("data-loaded", "");
	if (img.complete) done();
	else {
		img.addEventListener("load", done, { once: true });
		img.addEventListener("error", done, { once: true });
	}
});

// Card spotlight -------------------------------------------------------
// Feeds --mx/--my to the hovered card's radial glow (motion.css).
const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
let spot: PointerEvent | null = null;
document.addEventListener(
	"pointermove",
	(e) => {
		if (e.pointerType !== "mouse" || !finePointer.matches || !motionFull()) return;
		if (!spot)
			requestAnimationFrame(() => {
				const ev = spot!;
				spot = null;
				const card = (ev.target as Element).closest?.<HTMLElement>("a.card, .card.hoverable");
				if (!card) return;
				const r = card.getBoundingClientRect();
				card.style.setProperty("--mx", `${ev.clientX - r.left}px`);
				card.style.setProperty("--my", `${ev.clientY - r.top}px`);
			});
		spot = e;
	},
	{ passive: true },
);

// Card → page morphs ---------------------------------------------------
// Post and project cards carry data-vt="post-<slug>" and data-vt-part on
// their cover and title. Names go on the clicked card only, as the page
// swaps out, so a list never holds duplicates (Chrome skips the whole
// transition on a duplicate). The destination names its .vt-cover and
// .vt-title when it finds the key in sessionStorage (Base.astro).
type Swap = Event & {
	viewTransition: ViewTransition | null;
	activation: { entry?: { url: string } | null; navigationType?: string } | null;
};
type Reveal = Event & { viewTransition: ViewTransition | null };

let lastLink: HTMLAnchorElement | null = null;
let lastClickAt = 0;
addEventListener(
	"click",
	(e) => {
		const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]");
		if (a) [lastLink, lastClickAt] = [a, Date.now()];
	},
	true,
);

function clearNames() {
	document.querySelectorAll<HTMLElement>("[data-vt-part]").forEach((el) => {
		el.style.removeProperty("view-transition-name");
		el.style.removeProperty("view-transition-class");
	});
}

addEventListener("pageswap", (event) => {
	const e = event as Swap;
	clearNames();
	if (!e.viewTransition || !motionFull()) return;
	// Leaving a page we morphed into: keep its names only for "back".
	if (e.activation?.navigationType !== "traverse") root.classList.remove("vt-morph");
	const link = Date.now() - lastClickAt < 5000 ? lastLink : null;
	const card = link?.closest<HTMLElement>("[data-vt]");
	const dest = e.activation?.entry?.url ? new URL(e.activation.entry.url) : null;
	if (!link || !card || link.origin !== location.origin || (dest && dest.pathname !== link.pathname)) return;
	card.querySelectorAll<HTMLElement>("[data-vt-part]").forEach((part) => {
		part.style.setProperty("view-transition-name", `${card.dataset.vt}-${part.dataset.vtPart}`);
		part.style.setProperty("view-transition-class", `morph morph-${part.dataset.vtPart}`);
	});
	try {
		sessionStorage.setItem("vt-morph", link.pathname);
	} catch {}
});

// Back to a cached list page: its card kept the names for the reverse morph.
addEventListener("pagereveal", (event) => {
	const vt = (event as Reveal).viewTransition;
	if (vt) vt.finished.finally(clearNames);
	else clearNames();
});
addEventListener("pageshow", (e) => e.persisted && !("onpagereveal" in window) && clearNames());
