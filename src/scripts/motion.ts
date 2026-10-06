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
