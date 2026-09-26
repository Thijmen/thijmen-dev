/**
 * The writer page's own CSS. The admin's Tailwind build doesn't scan plugin
 * sources, so utility classes aren't reliable here; everything is under
 * `.aw` and built on Kumo's theme variables (light and dark follow the admin).
 * The preview pane borrows the site's look: serif display title with the
 * italic purple accent, mono kickers, terminal-style code windows.
 */
export const css = `
.aw {
	--aw-bg: var(--color-kumo-base, #fff);
	--aw-raised: var(--color-kumo-elevated, #fafafa);
	--aw-recessed: var(--color-kumo-recessed, #f4f4f5);
	--aw-line: var(--color-kumo-line, #e4e4e7);
	--aw-hair: var(--color-kumo-hairline, #ececef);
	--aw-text: var(--text-color-kumo-default, #27272a);
	--aw-subtle: var(--text-color-kumo-subtle, #71717a);
	--aw-strong: var(--text-color-kumo-strong, #09090b);
	--aw-brand: var(--color-kumo-brand, #7c3aed);
	--aw-brand-soft: color-mix(in oklab, var(--aw-brand) 12%, transparent);
	--aw-success: var(--color-kumo-success, #16a34a);
	--aw-warning: var(--color-kumo-warning, #d97706);
	--aw-warning-soft: color-mix(in oklab, var(--aw-warning) 16%, transparent);
	--aw-danger: var(--color-kumo-danger, #dc2626);
	--aw-accent: oklch(0.56 0.2 295);
	--aw-mono: ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, monospace;
	--aw-serif: Newsreader, "Iowan Old Style", Georgia, serif;
	color: var(--aw-text);
	font-size: 14px;
	line-height: 1.5;
}
.aw *, .aw *::before, .aw *::after { box-sizing: border-box; }
.aw-mono { font-family: var(--aw-mono); }
.aw-subtle { color: var(--aw-subtle); }

/* ── Header ── */
.aw-head { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.aw-head h1 { font-size: 22px; font-weight: 600; margin: 0; color: var(--aw-strong); }
.aw-head .aw-pill { margin-left: auto; }
.aw-pill { display: inline-flex; align-items: center; gap: 6px; font: 500 12px/1 var(--aw-mono); padding: 5px 9px; border: 1px solid var(--aw-line); border-radius: 999px; color: var(--aw-subtle); background: var(--aw-raised); }
.aw-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--aw-subtle); }
.aw-dot.live { background: var(--aw-success); box-shadow: 0 0 0 3px color-mix(in oklab, var(--aw-success) 25%, transparent); animation: aw-pulse 1.6s ease-in-out infinite; }
.aw-dot.mock { background: var(--aw-warning); }
@keyframes aw-pulse { 50% { box-shadow: 0 0 0 6px color-mix(in oklab, var(--aw-success) 0%, transparent); } }

/* ── Composer ── */
.aw-compose { max-width: 760px; }
.aw-types { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 8px 0 20px; }
.aw-type { display: flex; flex-direction: column; gap: 6px; text-align: left; padding: 14px; border: 1px solid var(--aw-line); border-radius: 10px; background: var(--aw-bg); color: inherit; cursor: pointer; font: inherit; transition: border-color .15s, background .15s; }
.aw-type:hover { border-color: var(--aw-subtle); }
.aw-type[aria-pressed="true"] { border-color: var(--aw-brand); background: var(--aw-brand-soft); }
.aw-type strong { font-size: 14px; color: var(--aw-strong); }
.aw-type span { font-size: 12px; color: var(--aw-subtle); }
.aw-label { display: block; font-size: 13px; font-weight: 600; margin: 0 0 6px; color: var(--aw-strong); }
.aw-textarea { width: 100%; min-height: 160px; resize: vertical; padding: 12px 14px; border: 1px solid var(--aw-line); border-radius: 10px; background: var(--aw-bg); color: inherit; font: inherit; line-height: 1.55; }
.aw-textarea:focus, .aw-input:focus { outline: 2px solid color-mix(in oklab, var(--aw-brand) 45%, transparent); outline-offset: 1px; border-color: var(--aw-brand); }
.aw-hints { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 10px 0 18px; font-size: 12px; color: var(--aw-subtle); }
.aw-hints b { font-weight: 600; color: var(--aw-text); }
.aw-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.aw-kbd { font: 11px var(--aw-mono); padding: 2px 5px; border: 1px solid var(--aw-line); border-bottom-width: 2px; border-radius: 4px; color: var(--aw-subtle); }

/* ── Workspace ── */
.aw-work { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 20px; align-items: start; }
@media (max-width: 1100px) { .aw-work { grid-template-columns: 1fr; } }
.aw-panel { border: 1px solid var(--aw-line); border-radius: 12px; background: var(--aw-bg); overflow: hidden; }
.aw-panel-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid var(--aw-hair); font: 600 11px/1.2 var(--aw-mono); letter-spacing: .06em; text-transform: uppercase; color: var(--aw-subtle); background: var(--aw-raised); }
.aw-panel-head .aw-right { margin-left: auto; display: flex; gap: 8px; align-items: center; text-transform: none; letter-spacing: 0; font-weight: 500; }
.aw-convo { display: flex; flex-direction: column; max-height: calc(100vh - 220px); min-height: 420px; }
.aw-scroll { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.aw-scroll > *, .aw-scroll .aw-steps, .aw-scroll .aw-ask, .aw-scroll .aw-say, .aw-scroll .aw-user, .aw-scroll .aw-banner { flex-shrink: 0; }
.aw-sticky { position: sticky; top: 16px; }

/* Messages */
.aw-user { align-self: flex-end; max-width: 88%; padding: 10px 13px; border-radius: 12px 12px 4px 12px; background: var(--aw-brand-soft); color: var(--aw-strong); white-space: pre-wrap; }
.aw-say { color: var(--aw-text); white-space: pre-wrap; }
.aw-caret::after { content: "▍"; margin-left: 1px; color: var(--aw-brand); animation: aw-blink 1s steps(2) infinite; }
@keyframes aw-blink { 50% { opacity: 0; } }

/* Steps */
.aw-steps { display: flex; flex-direction: column; border: 1px solid var(--aw-hair); border-radius: 10px; overflow: hidden; }
.aw-step { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 8px; align-items: start; padding: 8px 11px; font-size: 13px; }
.aw-step + .aw-step { border-top: 1px solid var(--aw-hair); }
.aw-step-icon { display: grid; place-items: center; width: 20px; height: 20px; margin-top: 1px; color: var(--aw-subtle); }
.aw-step.done .aw-step-icon { color: var(--aw-success); }
.aw-step.error .aw-step-icon { color: var(--aw-danger); }
.aw-step.running .aw-step-icon { color: var(--aw-brand); }
.aw-step-title { color: var(--aw-strong); }
.aw-step-detail { display: block; margin-top: 2px; font-size: 12px; color: var(--aw-subtle); overflow-wrap: anywhere; }
.aw-step.error .aw-step-detail { color: var(--aw-danger); }
.aw-step-time { font: 11px var(--aw-mono); color: var(--aw-subtle); padding-top: 2px; }
.aw-spin { width: 14px; height: 14px; border: 2px solid color-mix(in oklab, var(--aw-brand) 25%, transparent); border-top-color: var(--aw-brand); border-radius: 50%; animation: aw-spin .8s linear infinite; }
@keyframes aw-spin { to { transform: rotate(360deg); } }

/* Questions */
.aw-ask { border: 1px solid color-mix(in oklab, var(--aw-brand) 45%, var(--aw-line)); border-radius: 12px; background: var(--aw-brand-soft); padding: 14px; display: flex; flex-direction: column; gap: 14px; }
.aw-ask-head { display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--aw-strong); }
.aw-q { display: flex; flex-direction: column; gap: 7px; }
.aw-q-text { font-weight: 500; color: var(--aw-strong); }
.aw-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.aw-chip { font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--aw-line); background: var(--aw-bg); color: inherit; cursor: pointer; }
.aw-chip[aria-pressed="true"] { border-color: var(--aw-brand); background: var(--aw-brand); color: #fff; }
.aw-input { width: 100%; padding: 8px 11px; border: 1px solid var(--aw-line); border-radius: 8px; background: var(--aw-bg); color: inherit; font: inherit; }
.aw-q.skipped .aw-input { opacity: .5; }
.aw-answered { font-size: 12px; color: var(--aw-subtle); }
.aw-answered li { margin: 2px 0; }

/* Follow-up */
.aw-follow { border-top: 1px solid var(--aw-hair); padding: 10px; display: flex; gap: 8px; align-items: flex-end; background: var(--aw-raised); }
.aw-follow textarea { flex: 1; min-height: 40px; max-height: 160px; resize: none; padding: 9px 11px; border: 1px solid var(--aw-line); border-radius: 9px; background: var(--aw-bg); color: inherit; font: inherit; }
.aw-banner { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; font-size: 13px; }
.aw-banner.error { background: color-mix(in oklab, var(--aw-danger) 10%, transparent); color: var(--aw-danger); }
.aw-banner.warn { background: var(--aw-warning-soft); }
.aw-banner .aw-grow { flex: 1; }

/* ── Checklist ── */
.aw-fields { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 14px; border-bottom: 1px solid var(--aw-hair); }
.aw-field { display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; border-radius: 999px; font-size: 12px; border: 1px solid var(--aw-line); color: var(--aw-subtle); background: var(--aw-bg); }
.aw-field.done { color: var(--aw-strong); border-color: color-mix(in oklab, var(--aw-success) 45%, var(--aw-line)); }
.aw-field.done svg { color: var(--aw-success); }
.aw-field.todo { color: var(--aw-strong); border-color: color-mix(in oklab, var(--aw-warning) 55%, var(--aw-line)); background: var(--aw-warning-soft); }
.aw-field.writing { color: var(--aw-brand); border-color: var(--aw-brand); background: var(--aw-brand-soft); }
.aw-field.error { color: var(--aw-danger); border-color: var(--aw-danger); }

/* ── Preview (the site's look) ── */
.aw-preview { padding: 26px 30px 34px; max-height: calc(100vh - 290px); overflow-y: auto; }
.aw-preview .aw-empty { text-align: center; padding: 60px 10px; color: var(--aw-subtle); }
.aw-kicker { font: 500 12px/1.4 var(--aw-mono); letter-spacing: .02em; color: var(--aw-subtle); margin-bottom: 10px; }
.aw-title { font: 400 34px/1.12 var(--aw-serif); letter-spacing: -.01em; color: var(--aw-strong); margin: 0 0 14px; text-wrap: balance; }
.aw-title em, .aw-cta em { font-style: italic; color: var(--aw-accent); }
.aw-lede { font-size: 16px; color: var(--aw-subtle); margin: 0 0 18px; max-width: 60ch; }
.aw-meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 22px; }
.aw-tag { font: 500 11px/1 var(--aw-mono); padding: 5px 8px; border-radius: 6px; border: 1px solid var(--aw-line); color: var(--aw-subtle); }
.aw-tag.accent { border-color: var(--aw-accent); color: var(--aw-accent); }
.aw-seo { margin: 0 0 22px; padding: 10px 12px; border: 1px dashed var(--aw-line); border-radius: 8px; font-size: 12px; color: var(--aw-subtle); }
.aw-seo b { font: 600 10px var(--aw-mono); letter-spacing: .06em; text-transform: uppercase; display: block; margin-bottom: 3px; }
.aw-body { font: 17px/1.7 var(--aw-serif); color: var(--aw-text); max-width: 68ch; }
.aw-body h2 { font: 500 23px/1.25 var(--aw-serif); color: var(--aw-strong); margin: 30px 0 8px; }
.aw-body h3 { font: 500 19px/1.3 var(--aw-serif); color: var(--aw-strong); margin: 22px 0 6px; }
.aw-body p { margin: 0 0 14px; }
.aw-body ul, .aw-body ol { margin: 0 0 14px; padding-left: 22px; }
.aw-body code { font: 13.5px var(--aw-mono); padding: 1px 5px; border-radius: 4px; background: var(--aw-recessed); }
.aw-body a { color: var(--aw-accent); }
.aw-note { margin: 16px 0; padding: 12px 14px; border-left: 3px solid var(--aw-accent); background: color-mix(in oklab, var(--aw-accent) 8%, transparent); border-radius: 0 8px 8px 0; font-size: 15px; }
.aw-note::before { content: "NOTE"; display: block; font: 600 10px var(--aw-mono); letter-spacing: .1em; color: var(--aw-accent); margin-bottom: 4px; }
.aw-code { margin: 16px 0; border-radius: 10px; overflow: hidden; background: #16131d; color: #e9e6f2; font: 12.5px/1.6 var(--aw-mono); }
.aw-code-bar { display: flex; align-items: center; gap: 6px; padding: 7px 11px; background: #1f1b29; color: #9a93ad; font-size: 11px; }
.aw-code-bar i { width: 9px; height: 9px; border-radius: 50%; background: #3a3448; display: inline-block; }
.aw-code-bar span { margin-left: 6px; }
.aw-code pre { margin: 0; padding: 12px 14px; overflow-x: auto; white-space: pre; }
.aw-todo { color: inherit; background: var(--aw-warning-soft); outline: 1px solid color-mix(in oklab, var(--aw-warning) 50%, transparent); border-radius: 3px; padding: 0 2px; font-family: var(--aw-mono); font-size: .8em; }
.aw-live { position: relative; }
.aw-live::before { content: "writing…"; position: absolute; top: -18px; right: 0; font: 11px var(--aw-mono); color: var(--aw-brand); }
.aw-blocks { margin-top: 26px; display: flex; flex-direction: column; gap: 12px; }
.aw-block { border: 1px solid var(--aw-line); border-radius: 10px; padding: 12px 14px; }
.aw-block-type { font: 600 10px var(--aw-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--aw-subtle); margin-bottom: 6px; display: flex; gap: 8px; }
.aw-block-type b { color: var(--aw-accent); font-weight: 600; }
.aw-block .aw-body { font-size: 15px; }
.aw-faq dt { font-weight: 600; color: var(--aw-strong); }
.aw-faq dd { margin: 2px 0 8px; color: var(--aw-subtle); }
.aw-linkrow { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; border-bottom: 1px dashed var(--aw-hair); font-size: 13px; }
.aw-cta { font: 20px/1.3 var(--aw-serif); color: var(--aw-strong); }

/* ── Footer ── */
.aw-foot { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-top: 1px solid var(--aw-hair); background: var(--aw-raised); flex-wrap: wrap; }
.aw-foot .aw-stats { font: 11px var(--aw-mono); color: var(--aw-subtle); margin-right: auto; }
.aw-saved { display: inline-flex; align-items: center; gap: 6px; color: var(--aw-success); font-weight: 500; }
.aw-link { display: inline-flex; align-items: center; gap: 6px; font-weight: 500; color: var(--aw-brand); text-decoration: none; }
.aw-link:hover { text-decoration: underline; }

/* ── Runs ── */
.aw-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.aw-table th { text-align: left; font: 600 11px var(--aw-mono); letter-spacing: .05em; text-transform: uppercase; color: var(--aw-subtle); padding: 8px 10px; border-bottom: 1px solid var(--aw-line); }
.aw-table td { padding: 9px 10px; border-bottom: 1px solid var(--aw-hair); vertical-align: top; }
.aw-status { font: 500 11px var(--aw-mono); padding: 2px 7px; border-radius: 999px; }
.aw-status.ok { color: var(--aw-success); background: color-mix(in oklab, var(--aw-success) 12%, transparent); }
.aw-status.error { color: var(--aw-danger); background: color-mix(in oklab, var(--aw-danger) 12%, transparent); }
`;
