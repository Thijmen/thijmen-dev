/** @jsxImportSource react */
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { Button, Loader } from "@cloudflare/kumo";
import { ArrowClockwiseIcon, ArrowRightIcon, ArticleIcon, CheckCircleIcon, FileTextIcon, FolderSimpleIcon, MagicWandIcon, PaperPlaneRightIcon, StopIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useAgent } from "agents/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type Answer, INITIAL_STATE, type SessionBody, type WriterState } from "../agent/types";
import type { SessionInfo } from "../runtime";
import { api, editorUrl } from "./api";
import { Conversation } from "./Conversation";
import { type LiveField, Preview } from "./Preview";
import { css } from "./styles";

const TYPES = [
	{ value: "posts", label: "Blog post", hint: "An essay: body, excerpt, follow-up sections", icon: ArticleIcon },
	{ value: "projects", label: "Project", hint: "A case study for one of your repos", icon: FolderSimpleIcon },
	{ value: "pages", label: "Page", hint: "A /now or /colophon style page", icon: FileTextIcon },
] as const;

type Params = { session: string | null; collection: string; entryId: string | null };

function readParams(): Params {
	const q = new URLSearchParams(window.location.search);
	return { session: q.get("session"), collection: q.get("collection") ?? "posts", entryId: q.get("id") };
}

/** Opened from the editor panel (`start=1`): begin at once, with its brief if any. */
function readLaunch(): string | null {
	const q = new URLSearchParams(window.location.search);
	if (q.get("start") !== "1" || q.get("session")) return null;
	return q.get("brief") || DEFAULT_REVISE_BRIEF;
}

const DEFAULT_REVISE_BRIEF = "Fill in the fields that are still empty, in the house style.";

function writeParams(p: Params) {
	const q = new URLSearchParams();
	if (p.session) q.set("session", p.session);
	q.set("collection", p.collection);
	if (p.entryId) q.set("id", p.entryId);
	window.history.replaceState(window.history.state, "", `${window.location.pathname}?${q}`);
}

/**
 * New with AI: pick a type, write a brief, then watch the WriterAgent work:
 * steps on the left, the entry filling in on the right, questions inline,
 * follow-ups to iterate, and Save when it's right. The session id lives in
 * the URL, so a reload picks the conversation up where it was.
 */
export function WriterPage() {
	const [params, setParams] = useState<Params>(readParams);
	const [info, setInfo] = useState<SessionInfo | null>(null);
	const [brief, setBrief] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [starting, setStarting] = useState(() => readLaunch() !== null);

	const open = useCallback(async (p: Params, firstBrief: string | null) => {
		setStarting(true);
		setError(null);
		try {
			const session = p.session ?? `w-${crypto.randomUUID()}`;
			const next = { ...p, session };
			const loaded = await api.session(session, p.collection, p.entryId);
			writeParams(next);
			setParams(next);
			setBrief(firstBrief);
			setInfo(loaded);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setStarting(false);
		}
	}, []);

	// Resume a session from the URL, or start one launched from the editor panel.
	useEffect(() => {
		const launch = readLaunch();
		if (params.session && !info) void open(params, null);
		else if (launch) void open(params, launch);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const startOver = () => {
		const next = { session: null, collection: params.collection, entryId: null };
		writeParams(next);
		setParams(next);
		setInfo(null);
		setBrief(null);
	};

	return (
		<div className="aw">
			<style>{css}</style>
			{info && params.session ? (
				<Workspace key={params.session} info={info} session={params.session} initialBrief={brief} onStartOver={startOver} />
			) : (params.session || starting) && !error ? (
				<div className="aw-actions aw-subtle">
					<Loader /> {params.session ? "Reconnecting to the writing session…" : "Starting the writer…"}
				</div>
			) : (
				<Composer params={params} setParams={setParams} starting={starting} error={error} onStart={(b) => open({ ...params, session: null }, b)} />
			)}
		</div>
	);
}

// ── Composer ──

function Composer({
	params,
	setParams,
	starting,
	error,
	onStart,
}: {
	params: Params;
	setParams: (p: Params) => void;
	starting: boolean;
	error: string | null;
	onStart: (brief: string) => void;
}) {
	const [text, setText] = useState("");
	const revising = params.entryId !== null;
	const type = TYPES.find((t) => t.value === params.collection) ?? TYPES[0];
	const canStart = revising || text.trim().length > 0;
	const submit = () => {
		if (!canStart || starting) return;
		onStart(text.trim() || DEFAULT_REVISE_BRIEF);
	};

	return (
		<div className="aw-compose">
			<div className="aw-head">
				<MagicWandIcon size={24} weight="duotone" />
				<h1>{revising ? `Revise this ${type.label.toLowerCase()} with AI` : "New with AI"}</h1>
			</div>
			{!revising && (
				<>
					<span className="aw-label">What are you writing?</span>
					<div className="aw-types">
						{TYPES.map((t) => (
							<button key={t.value} type="button" className="aw-type" aria-pressed={t.value === params.collection} onClick={() => setParams({ ...params, collection: t.value })}>
								<t.icon size={20} />
								<strong>{t.label}</strong>
								<span>{t.hint}</span>
							</button>
						))}
					</div>
				</>
			)}
			<label className="aw-label" htmlFor="aw-brief">
				{revising ? "What should change? (optional)" : "Brief"}
			</label>
			<textarea
				id="aw-brief"
				className="aw-textarea"
				autoFocus
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
				}}
				placeholder={
					revising
						? "e.g. tighten the excerpt, add an FAQ section, rewrite the title. Leave empty to fill whatever is still empty."
						: "What it's about, the point you want to make, and any facts: numbers, names, links. Paste URLs to have them read."
				}
			/>
			<div className="aw-hints">
				<span>
					<b>Reads</b> your profile, the site's posts and projects, and links you paste
				</span>
				<span>
					<b>Asks</b> when it needs a fact instead of inventing one
				</span>
				<span>
					<b>Saves</b> a draft only when you press Save
				</span>
			</div>
			{error && (
				<div className="aw-banner error" style={{ marginBottom: 14 }}>
					<WarningCircleIcon size={18} weight="fill" />
					<span className="aw-grow">{error}</span>
				</div>
			)}
			<div className="aw-actions">
				<Button variant="primary" onClick={submit} disabled={!canStart} loading={starting} icon={MagicWandIcon}>
					{revising ? "Start revising" : "Write it"}
				</Button>
				<span className="aw-kbd">⌘ ↵</span>
			</div>
		</div>
	);
}

// ── Workspace ──

function sessionBody(info: SessionInfo): SessionBody {
	const { token: _t, modelLabel: _l, mock: _m, ...body } = info;
	return body;
}

function Workspace({ info, session, initialBrief, onStartOver }: { info: SessionInfo; session: string; initialBrief: string | null; onStartOver: () => void }) {
	const [state, setState] = useState<WriterState>(INITIAL_STATE);
	const agent = useAgent<WriterState>({
		agent: "WriterAgent",
		name: session,
		query: { token: info.token },
		onStateUpdate: (s) => setState(s),
	});
	const body = useMemo(() => sessionBody(info), [info]);
	const chat = useAgentChat({
		agent,
		body,
		// Client-side tools: run in the browser under the admin session.
		onToolCall: async ({ toolCall, addToolOutput }) => {
			if (toolCall.toolName !== "search_content") return; // ask_user is answered in the UI
			try {
				addToolOutput({ toolCallId: toolCall.toolCallId, output: await api.search(toolCall.input) });
			} catch (e) {
				addToolOutput({ toolCallId: toolCall.toolCallId, state: "output-error", errorText: e instanceof Error ? e.message : String(e) });
			}
		},
	});
	const { messages, sendMessage, stop, isStreaming, addToolOutput, error, regenerate } = chat;

	// Send the brief once, for a fresh session.
	const sent = useRef(false);
	useEffect(() => {
		if (sent.current || !initialBrief || !agent.identified || messages.length) return;
		sent.current = true;
		void sendMessage({ role: "user", parts: [{ type: "text", text: initialBrief }] });
	}, [initialBrief, agent.identified, messages.length, sendMessage]);

	// Step timings: when each tool call was first seen and when it finished.
	const timings = useRef(new Map<string, { start: number; end?: number }>());
	const [, tick] = useState(0);
	useEffect(() => {
		if (!isStreaming) return;
		const id = setInterval(() => tick((n) => n + 1), 250);
		return () => clearInterval(id);
	}, [isStreaming]);
	const pending = findPendingQuestion(messages);
	for (const m of messages) {
		for (const part of m.parts) {
			if (!isToolUIPart(part)) continue;
			const p = part as unknown as { toolCallId: string; state: string };
			const t = timings.current.get(p.toolCallId) ?? { start: Date.now() };
			if (p.state.startsWith("output") && !t.end) t.end = Date.now();
			timings.current.set(p.toolCallId, t);
		}
	}
	const elapsed = (id: string) => {
		const t = timings.current.get(id);
		return t ? ((t.end ?? Date.now()) - t.start) / 1000 : 0;
	};

	const live = findLiveField(messages, isStreaming);
	const labelOf = useCallback((field: string) => info.targets.find((t) => t.field === field)?.label ?? field, [info.targets]);

	// Save / saved.
	const [saved, setSaved] = useState<{ id: string; created: boolean } | null>(info.entryId ? { id: info.entryId, created: false } : null);
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [dirty, setDirty] = useState(false);
	const fieldsKey = JSON.stringify(state.fields);
	const lastSavedKey = useRef<string | null>(null);
	useEffect(() => {
		setDirty(lastSavedKey.current !== fieldsKey && Object.keys(state.fields).length > 0);
	}, [fieldsKey, state.fields]);
	const save = async () => {
		setSaving(true);
		setSaveError(null);
		try {
			const result = await api.save(info.collection, saved?.id ?? info.entryId, state.fields);
			setSaved({ id: result.id, created: result.created || Boolean(saved?.created) });
			lastSavedKey.current = fieldsKey;
			setDirty(false);
		} catch (e) {
			setSaveError(e instanceof Error ? e.message : String(e));
		} finally {
			setSaving(false);
		}
	};

	// Log each finished turn (brief → idle) to the runs page, tokens summed over continuations.
	// A turn ends once the agent stays idle for 2s, on a follow-up, or when the page goes away.
	const run = useRef<{ start: number; input: number; output: number; seen: string | null; idleAt: number | null } | null>(null);
	const latest = useRef({ messages, state, saved, error });
	latest.current = { messages, state, saved, error };
	const flushRun = useCallback(() => {
		const r = run.current;
		if (!r || r.idleAt === null) return;
		run.current = null;
		const { messages: msgs, state: st, saved: sv, error: err } = latest.current;
		const lastUser = [...msgs].reverse().find((m) => m.role === "user");
		void api.logRun({
			collection: info.collection,
			entryId: sv?.id ?? info.entryId ?? "",
			model: info.mock ? "mock" : info.model,
			brief: lastUser?.parts.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "",
			status: err ? "error" : "ok",
			...(err ? { error: err.message } : {}),
			ms: r.idleAt - r.start,
			inputTokens: r.input,
			outputTokens: r.output,
			written: Object.values(st.status).filter((x) => x === "done" || x === "todo").length,
			todos: st.todos,
		});
	}, [info]);
	useEffect(() => {
		if (isStreaming && !run.current) run.current = { start: Date.now(), input: 0, output: 0, seen: null, idleAt: null };
	}, [isStreaming]);
	useEffect(() => {
		const r = run.current;
		const t = state.lastTurn;
		if (r && t && t.at !== r.seen) {
			r.seen = t.at;
			r.input += t.inputTokens ?? 0;
			r.output += t.outputTokens ?? 0;
		}
	}, [state.lastTurn]);
	useEffect(() => {
		const r = run.current;
		if (!r) return;
		if (isStreaming || pending) {
			r.idleAt = null;
			return;
		}
		r.idleAt = Date.now();
		const timer = setTimeout(flushRun, 2000);
		return () => clearTimeout(timer);
	}, [isStreaming, pending, flushRun]);
	useEffect(() => {
		// React cleanup doesn't run on a reload or tab close; pagehide does.
		window.addEventListener("pagehide", flushRun);
		return () => {
			window.removeEventListener("pagehide", flushRun);
			flushRun();
		};
	}, [flushRun]);

	// Auto-scroll the conversation while it grows.
	const scroller = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = scroller.current;
		if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
	});

	const [followUp, setFollowUp] = useState("");
	const send = () => {
		const text = followUp.trim();
		if (!text || isStreaming || pending) return;
		setFollowUp("");
		flushRun();
		void sendMessage({ role: "user", parts: [{ type: "text", text }] });
	};
	const answer = (toolCallId: string, answers: Answer[]) => addToolOutput({ toolCallId, toolName: "ask_user", output: { answers } });

	const typeLabel = info.collectionLabel;
	const busy = isStreaming || !agent.identified;
	const written = info.targets.filter((t) => state.status[t.field] === "done" || state.status[t.field] === "todo").length;
	const hasTitle = info.targets.some((t) => t.kind === "title" && state.fields[t.field]);

	return (
		<>
			<div className="aw-head">
				<MagicWandIcon size={24} weight="duotone" />
				<h1>
					{info.entryId ? "Revising" : "Writing"} a {typeLabel.toLowerCase()}
				</h1>
				<span className="aw-pill" title={info.model}>
					<span className={`aw-dot ${info.mock ? "mock" : isStreaming ? "live" : ""}`} />
					{info.mock ? "mock model" : info.modelLabel}
					{isStreaming ? " · working" : pending ? " · waiting for you" : ""}
				</span>
				<Button variant="ghost" size="sm" onClick={onStartOver}>
					Start over
				</Button>
			</div>

			{agent.connectionError && (
				<div className="aw-banner error" style={{ marginBottom: 14 }}>
					<WarningCircleIcon size={18} weight="fill" />
					<span className="aw-grow">Lost the connection to the writer ({String((agent.connectionError as { message?: string }).message ?? "unknown error")}). Reload the page to reconnect; the session is kept.</span>
				</div>
			)}

			<div className="aw-work">
				<section className="aw-panel aw-convo">
					<div className="aw-panel-head">
						Session
						<span className="aw-right">
							{isStreaming && (
								<Button size="sm" variant="secondary" icon={StopIcon} onClick={() => stop()}>
									StopIcon
								</Button>
							)}
						</span>
					</div>
					<div className="aw-scroll" ref={scroller}>
						{!agent.identified && messages.length === 0 && (
							<div className="aw-actions aw-subtle">
								<Loader /> Connecting…
							</div>
						)}
						<Conversation messages={messages} streaming={isStreaming} labelOf={labelOf} elapsed={elapsed} onAnswer={answer} />
						{isStreaming && !pending && !live && lastIsIdle(messages) && (
							<div className="aw-actions aw-subtle">
								<span className="aw-spin" /> Thinking…
							</div>
						)}
						{error && (
							<div className="aw-banner error">
								<WarningCircleIcon size={18} weight="fill" />
								<span className="aw-grow">
									{error.message}
									{/run remotely/i.test(error.message) ? " — local dev has no Workers AI. Restart with `pnpm dev:ai`, or set AI_WRITER_MOCK=1 in .dev.vars for the mock model." : ""}
								</span>
								<Button size="sm" variant="secondary" icon={ArrowClockwiseIcon} onClick={() => regenerate()}>
									Retry
								</Button>
							</div>
						)}
					</div>
					<div className="aw-follow">
						<textarea
							placeholder={pending ? "Answer the questions above first" : written ? "Ask for changes: “shorter excerpt”, “more on retries”, “add an FAQ”" : "Add something for the writer…"}
							value={followUp}
							disabled={Boolean(pending)}
							onChange={(e) => setFollowUp(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									send();
								}
							}}
						/>
						<Button variant="primary" shape="square" icon={PaperPlaneRightIcon} aria-label="Send" disabled={!followUp.trim() || busy || Boolean(pending)} onClick={send} />
					</div>
				</section>

				<section className="aw-panel aw-sticky">
					<div className="aw-panel-head">
						Preview
						<span className="aw-right aw-mono">
							{written}/{info.targets.length} fields{state.todos ? ` · ${state.todos} TODO` : ""}
						</span>
					</div>
					<div className="aw-fields">
						{info.targets.map((t) => {
							const s = live?.field === t.field ? "writing" : (state.status[t.field] ?? "pending");
							return (
								<span key={t.field} className={`aw-field ${s}`} title={state.errors[t.field] ?? undefined}>
									{s === "writing" ? <span className="aw-spin" /> : s === "done" ? <CheckCircleIcon size={14} weight="fill" /> : s === "todo" ? <WarningCircleIcon size={14} weight="fill" /> : s === "error" ? <WarningCircleIcon size={14} /> : <span className="aw-dot" />}
									{t.label}
								</span>
							);
						})}
					</div>
					<div className="aw-preview">
						<Preview state={{ ...state, targets: state.targets.length ? state.targets : info.targets }} live={live} typeLabel={typeLabel} />
					</div>
					<div className="aw-foot">
						<span className="aw-stats">
							{state.lastTurn ? `${((state.lastTurn.ms ?? 0) / 1000).toFixed(1)}s · ${state.lastTurn.inputTokens ?? "?"}→${state.lastTurn.outputTokens ?? "?"} tokens` : " "}
						</span>
						{saveError && <span className="aw-subtle" style={{ color: "var(--aw-danger)" }}>{saveError}</span>}
						{saved && !dirty && lastSavedKey.current !== null && (
							<span className="aw-saved">
								<CheckCircleIcon size={16} weight="fill" /> Saved as draft
							</span>
						)}
						{saved && (
							<a className="aw-link" href={editorUrl(info.collection, saved.id)}>
								Open in editor <ArrowRightIcon size={14} />
							</a>
						)}
						<Button variant="primary" onClick={save} loading={saving} disabled={busy || Boolean(pending) || !dirty || (!saved && !hasTitle)}>
							{saved ? "Save changes" : "Save draft"}
						</Button>
					</div>
				</section>
			</div>
			{info.entryId && (
				<p className="aw-subtle" style={{ marginTop: 12, fontSize: 12 }}>
					Saving writes draft changes to the entry (it stays published as it was until you publish). Close the entry in other tabs first, or reload it there after saving.
				</p>
			)}
		</>
	);
}

/** The ask_user call still waiting for an answer, if any. */
function findPendingQuestion(messages: UIMessage[]): string | null {
	const last = messages[messages.length - 1];
	if (!last || last.role !== "assistant") return null;
	for (const part of last.parts) {
		if (!isToolUIPart(part) || getToolName(part) !== "ask_user") continue;
		const p = part as unknown as { toolCallId: string; state: string };
		if (p.state === "input-available") return p.toolCallId;
	}
	return null;
}

/** The set_field call streaming right now, so the preview can show it being written. */
function findLiveField(messages: UIMessage[], streaming: boolean): LiveField | null {
	if (!streaming) return null;
	const last = messages[messages.length - 1];
	if (!last || last.role !== "assistant") return null;
	for (let i = last.parts.length - 1; i >= 0; i--) {
		const part = last.parts[i];
		if (!isToolUIPart(part) || getToolName(part) !== "set_field") continue;
		const p = part as unknown as { state: string; input?: { field?: unknown; value?: unknown } };
		if (p.state !== "input-streaming" && p.state !== "input-available") return null;
		if (typeof p.input?.field === "string" && typeof p.input.value === "string") return { field: p.input.field, value: p.input.value };
		return null;
	}
	return null;
}

/** True when the last assistant part is finished, i.e. the model is between steps. */
function lastIsIdle(messages: UIMessage[]): boolean {
	const last = messages[messages.length - 1];
	if (!last || last.role !== "assistant") return true;
	const part = last.parts[last.parts.length - 1];
	if (!part) return true;
	if (part.type === "text") return false;
	return !isToolUIPart(part) || (part as unknown as { state: string }).state.startsWith("output");
}
