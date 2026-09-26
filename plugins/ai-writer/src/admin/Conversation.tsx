/** @jsxImportSource react */
import { Button } from "@cloudflare/kumo";
import { CheckCircleIcon, GlobeIcon, ListChecksIcon, MagnifyingGlassIcon, PencilSimpleLineIcon, QuestionIcon, TagIcon, TreeStructureIcon, UserCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { type ReactNode, useState } from "react";

import type { Answer, Question as Q } from "../agent/types";

type ToolPart = {
	toolCallId: string;
	state: "input-streaming" | "input-available" | "output-available" | "output-error" | string;
	input?: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
};

type Props = {
	messages: UIMessage[];
	streaming: boolean;
	labelOf: (field: string) => string;
	/** Seconds a tool call took (or has been running), tracked by the page. */
	elapsed: (toolCallId: string, finished: boolean) => number;
	onAnswer: (toolCallId: string, answers: Answer[]) => void;
};

export function Conversation({ messages, streaming, labelOf, elapsed, onAnswer }: Props) {
	const lastAssistant = messages.map((m) => m.role).lastIndexOf("assistant");
	return (
		<>
			{messages.map((message, mi) => {
				if (message.role === "user") {
					const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
					return (
						<div key={message.id} className="aw-user">
							{text}
						</div>
					);
				}
				if (message.role !== "assistant") return null;

				// Consecutive tool calls share one step list; text and questions break it.
				const chunks: ReactNode[] = [];
				let steps: ReactNode[] = [];
				const flush = () => {
					if (steps.length) chunks.push(<div key={`s${chunks.length}`} className="aw-steps">{steps}</div>);
					steps = [];
				};
				message.parts.forEach((part, pi) => {
					const isLastText = mi === lastAssistant && pi === message.parts.length - 1 && streaming;
					if (part.type === "text") {
						if (!part.text.trim()) return;
						flush();
						chunks.push(
							<div key={pi} className={`aw-say ${isLastText ? "aw-caret" : ""}`}>
								{part.text}
							</div>,
						);
						return;
					}
					if (!isToolUIPart(part)) return;
					const name = getToolName(part);
					const tool = part as unknown as ToolPart;
					if (name === "ask_user") {
						flush();
						chunks.push(<AskCard key={tool.toolCallId} part={tool} onAnswer={onAnswer} />);
						return;
					}
					steps.push(<Step key={tool.toolCallId} name={name} part={tool} labelOf={labelOf} seconds={elapsed(tool.toolCallId, tool.state.startsWith("output"))} />);
				});
				flush();
				return <div key={message.id} style={{ display: "contents" }}>{chunks}</div>;
			})}
		</>
	);
}

function Step({ name, part, labelOf, seconds }: { name: string; part: ToolPart; labelOf: (f: string) => string; seconds: number }) {
	const running = !part.state.startsWith("output");
	const output = (part.output ?? {}) as Record<string, unknown>;
	const failed = part.state === "output-error" || output.ok === false || typeof output.error === "string";
	const { icon, title, detail } = describe(name, part.input ?? {}, output, running, labelOf);
	const cls = failed ? "error" : running ? "running" : "done";
	return (
		<div className={`aw-step ${cls}`}>
			<span className="aw-step-icon">{running ? <span className="aw-spin" /> : failed ? <WarningCircleIcon size={17} weight="fill" /> : icon}</span>
			<span>
				<span className="aw-step-title">{title}</span>
				{(failed ? String(output.error ?? part.errorText ?? "failed") : detail) && (
					<span className="aw-step-detail">{failed ? String(output.error ?? part.errorText ?? "failed") : detail}</span>
				)}
			</span>
			<span className="aw-step-time">{seconds.toFixed(1)}s</span>
		</div>
	);
}

function describe(
	name: string,
	input: Record<string, unknown>,
	out: Record<string, unknown>,
	running: boolean,
	labelOf: (f: string) => string,
): { icon: ReactNode; title: string; detail?: string } {
	const done = <CheckCircleIcon size={17} weight="fill" />;
	switch (name) {
		case "get_entry_spec": {
			const fields = (out.fields as Array<{ label: string }> | undefined) ?? [];
			return { icon: <TreeStructureIcon size={17} />, title: running ? "Reading the entry's fields" : `Read ${fields.length} fields`, detail: fields.map((f) => f.label).join(" · ") };
		}
		case "get_profile":
			return { icon: <UserCircleIcon size={17} />, title: running ? "Reading your profile" : "Read your profile", detail: running ? undefined : `${Object.keys(out).length} facts` };
		case "search_content": {
			const results = (out.results as Array<{ title: string }> | undefined) ?? [];
			return {
				icon: <MagnifyingGlassIcon size={17} />,
				title: `Searching the site for “${String(input.query ?? "")}”`,
				detail: running ? undefined : results.length ? results.slice(0, 4).map((r) => r.title).join(" · ") : "nothing related yet",
			};
		}
		case "fetch_url": {
			let host = String(input.url ?? "");
			try {
				host = new URL(host).hostname;
			} catch {}
			return { icon: <GlobeIcon size={17} />, title: `Reading ${host}`, detail: running ? undefined : String(out.title ?? (out.text ? `${String(out.text).length} characters` : "")) };
		}
		case "set_field": {
			const label = labelOf(String(input.field ?? "…"));
			const todos = Number(out.todos ?? 0);
			const warnings = (out.warnings as string[] | undefined) ?? [];
			return {
				icon: <PencilSimpleLineIcon size={17} />,
				title: running ? `Writing ${label.toLowerCase()}…` : `Wrote ${label.toLowerCase()}`,
				detail: running ? undefined : [todos ? `${todos} TODO` : "", ...warnings].filter(Boolean).join(" · ") || undefined,
			};
		}
		case "suggest_tags":
			return { icon: <TagIcon size={17} />, title: "Picking tags", detail: running ? undefined : ((out.tags as string[]) ?? []).join(", ") || "none fit" };
		case "validate_entry": {
			const missing = (out.missing as string[] | undefined) ?? [];
			const todos = Number(out.todos ?? 0);
			return {
				icon: <ListChecksIcon size={17} />,
				title: running ? "Checking the entry" : missing.length || todos ? "Checked the entry" : "Entry checks out",
				detail: running ? undefined : [missing.length ? `empty: ${missing.map(labelOf).join(", ")}` : "", todos ? `${todos} TODO to resolve` : ""].filter(Boolean).join(" · ") || undefined,
			};
		}
		default:
			return { icon: done, title: name };
	}
}

/** The agent's questions. Pick an option or type an answer; skipping leaves a [TODO]. */
function AskCard({ part, onAnswer }: { part: ToolPart; onAnswer: (id: string, answers: Answer[]) => void }) {
	const questions = ((part.input?.questions as Q[] | undefined) ?? []).filter((q) => q?.question);
	const [values, setValues] = useState<Array<string | null>>(() => questions.map(() => ""));
	const answered = part.state.startsWith("output");

	if (answered) {
		const answers = ((part.output as { answers?: Answer[] } | undefined)?.answers ?? []) as Answer[];
		return (
			<div className="aw-steps">
				<div className="aw-step done">
					<span className="aw-step-icon">
						<QuestionIcon size={17} />
					</span>
					<span>
						<span className="aw-step-title">You answered</span>
						<ul className="aw-answered">
							{answers.map((a, i) => (
								<li key={i}>
									{a.question} — <b>{a.answer ?? "skipped (TODO)"}</b>
								</li>
							))}
						</ul>
					</span>
					<span />
				</div>
			</div>
		);
	}
	if (part.state === "input-streaming") {
		return (
			<div className="aw-ask">
				<div className="aw-ask-head">
					<span className="aw-spin" /> Preparing questions…
				</div>
			</div>
		);
	}

	const set = (i: number, v: string | null) => setValues((prev) => prev.map((x, j) => (j === i ? v : x)));
	const submit = (skipAll = false) =>
		onAnswer(
			part.toolCallId,
			questions.map((q, i) => ({ question: q.question, answer: skipAll ? null : values[i] === null || !String(values[i]).trim() ? null : String(values[i]).trim() })),
		);

	return (
		<form
			className="aw-ask"
			onSubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<div className="aw-ask-head">
				<QuestionIcon size={18} weight="fill" /> {questions.length === 1 ? "One question" : `${questions.length} questions`} before I write
			</div>
			{questions.map((q, i) => (
				<div key={i} className={`aw-q ${values[i] === null ? "skipped" : ""}`}>
					<div className="aw-q-text">{q.question}</div>
					{q.options?.length ? (
						<div className="aw-chips">
							{q.options.map((o) => (
								<button key={o} type="button" className="aw-chip" aria-pressed={values[i] === o} onClick={() => set(i, values[i] === o ? "" : o)}>
									{o}
								</button>
							))}
						</div>
					) : null}
					<input
						className="aw-input"
						placeholder={q.options?.length ? "…or type your own" : "Your answer (leave empty to skip)"}
						value={values[i] ?? ""}
						onChange={(e) => set(i, e.target.value)}
						autoFocus={i === 0}
					/>
				</div>
			))}
			<div className="aw-actions">
				<Button type="submit" variant="primary">
					Answer
				</Button>
				<Button type="button" variant="ghost" onClick={() => submit(true)}>
					Skip all (leave TODOs)
				</Button>
			</div>
		</form>
	);
}
