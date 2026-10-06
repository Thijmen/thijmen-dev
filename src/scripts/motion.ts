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
