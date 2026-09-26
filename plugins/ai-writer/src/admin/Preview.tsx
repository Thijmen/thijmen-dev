/** @jsxImportSource react */
import { MagicWandIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { WriterState } from "../agent/types";
import { markdownToPortableText, type PtNode } from "../markdown-to-pt";

/** A field the model is writing right now, from the streaming set_field input. */
export type LiveField = { field: string; value: string };

/**
 * The entry as the agent has written it so far, styled after the site:
 * kicker, serif title with the italic accent, lede, body, blocks. A field
 * still streaming in (`live`) renders from its partial Markdown.
 */
export function Preview({ state, live, typeLabel }: { state: WriterState; live: LiveField | null; typeLabel: string }) {
	const value = (field: string) => (live?.field === field ? live.value : state.fields[field]);
	const kindOf = new Map(state.targets.map((t) => [t.field, t.kind]));
	const titleField = state.targets.find((t) => t.kind === "title")?.field ?? "title";
	const has = (field: string) => {
		const v = value(field);
		return Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim() !== "";
	};
	const anything = state.targets.some((t) => has(t.field));

	if (!anything) {
		return (
			<div className="aw-empty">
				<MagicWandIcon size={28} weight="duotone" />
				<p>The {typeLabel.toLowerCase()} appears here as it's written.</p>
			</div>
		);
	}

	const short = state.targets.filter((t) => (t.kind === "string" || t.kind === "text") && !["kicker", "description", "cover_caption"].includes(t.field));
	const rich = state.targets.filter((t) => t.kind === "portableText" || t.kind === "blocks");
	const liveClass = (field: string) => (live?.field === field ? "aw-live" : undefined);

	return (
		<article>
			{has("kicker") && <div className={`aw-kicker ${liveClass("kicker") ?? ""}`}>{text(value("kicker"))}</div>}
			{has(titleField) ? (
				<h1 className={`aw-title ${liveClass(titleField) ?? ""}`}>{accent(text(value(titleField)))}</h1>
			) : (
				<h1 className="aw-title aw-subtle">Untitled</h1>
			)}
			{short.map((t) =>
				has(t.field) ? (
					<p key={t.field} className={`aw-lede ${liveClass(t.field) ?? ""}`}>
						{withTodos(text(value(t.field)))}
					</p>
				) : null,
			)}
			{(state.tags.length > 0 || has("cover_caption")) && (
				<div className="aw-meta">
					{state.tags.map((tag) => (
						<span key={tag} className="aw-tag accent">
							#{tag}
						</span>
					))}
					{has("cover_caption") && <span className="aw-tag">cover · {text(value("cover_caption"))}</span>}
				</div>
			)}
			{has("description") && (
				<div className="aw-seo">
					<b>SEO description</b>
					{text(value("description"))}
				</div>
			)}
			{rich.map((t) => {
				if (!has(t.field)) return null;
				const v = value(t.field);
				const isLive = live?.field === t.field;
				if (kindOf.get(t.field) === "portableText") {
					const nodes = isLive ? markdownToPortableText(String(v)) : (v as PtNode[]);
					return (
						<div key={t.field} className={`aw-body ${isLive ? "aw-live aw-caret" : ""}`}>
							<PortableText nodes={nodes} />
						</div>
					);
				}
				return isLive ? (
					<div key={t.field} className="aw-blocks aw-live">
						<div className="aw-block aw-subtle aw-mono">Composing {t.label.toLowerCase()}…</div>
					</div>
				) : (
					<div key={t.field} className="aw-blocks">
						{(v as Array<Record<string, unknown>>).map((block, i) => (
							<Block key={String(block._key ?? i)} block={block} />
						))}
					</div>
				);
			})}
		</article>
	);
}

function text(v: unknown): string {
	return typeof v === "string" ? v : "";
}

/** `*phrase*` → the italic accent, like `emphasize()` on the site. */
export function accent(s: string): ReactNode[] {
	return s.split(/(\*[^*]+\*)/g).map((part, i) =>
		/^\*[^*]+\*$/.test(part) ? <em key={i}>{part.slice(1, -1)}</em> : <span key={i}>{withTodos(part)}</span>,
	);
}

/** Highlight `[TODO: …]` markers so they're impossible to miss. */
function withTodos(s: string): ReactNode[] {
	return s.split(/(\[TODO:[^\]]*\])/g).map((part, i) => (part.startsWith("[TODO:") ? <mark key={i} className="aw-todo">{part}</mark> : part));
}

type Span = { text?: string; marks?: string[] };
type Block = { _type: string; _key?: string; style?: string; listItem?: string; children?: Span[]; markDefs?: Array<{ _key: string; href?: string }>; code?: string; language?: string; filename?: string };

function PortableText({ nodes }: { nodes: unknown[] }) {
	const out: ReactNode[] = [];
	let list: { type: string; items: ReactNode[] } | null = null;
	const flush = () => {
		if (!list) return;
		out.push(list.type === "number" ? <ol key={`l${out.length}`}>{list.items}</ol> : <ul key={`l${out.length}`}>{list.items}</ul>);
		list = null;
	};
	(nodes as Block[]).forEach((node, i) => {
		const key = node._key ?? String(i);
		if (node._type === "code") {
			flush();
			out.push(
				<div key={key} className="aw-code">
					<div className="aw-code-bar">
						<i />
						<i />
						<i />
						<span>{node.filename || node.language || "snippet"}</span>
					</div>
					<pre>{node.code}</pre>
				</div>,
			);
			return;
		}
		if (node._type !== "block") return;
		const content = spans(node);
		if (node.listItem) {
			if (!list || list.type !== node.listItem) {
				flush();
				list = { type: node.listItem, items: [] };
			}
			list.items.push(<li key={key}>{content}</li>);
			return;
		}
		flush();
		if (node.style === "h2") out.push(<h2 key={key}>{content}</h2>);
		else if (node.style === "h3") out.push(<h3 key={key}>{content}</h3>);
		else if (node.style === "blockquote") out.push(<div key={key} className="aw-note">{content}</div>);
		else out.push(<p key={key}>{content}</p>);
	});
	flush();
	return <>{out}</>;
}

function spans(node: Block): ReactNode[] {
	const links = new Map((node.markDefs ?? []).map((d) => [d._key, d.href]));
	return (node.children ?? []).map((span, i) => {
		let el: ReactNode = withTodos(span.text ?? "");
		for (const mark of span.marks ?? []) {
			if (mark === "strong") el = <strong>{el}</strong>;
			else if (mark === "em") el = <em>{el}</em>;
			else if (mark === "code") el = <code>{el}</code>;
			else if (links.has(mark)) el = <a href={links.get(mark)} target="_blank" rel="noreferrer">{el}</a>;
		}
		return <span key={i}>{el}</span>;
	});
}

function Block({ block }: { block: Record<string, unknown> }) {
	const type = String(block._type);
	const label = typeof block.label === "string" ? block.label : null;
	const head = (
		<div className="aw-block-type">
			<span>{type.replace("_", " ")}</span>
			{label && <b>{label}</b>}
		</div>
	);
	switch (type) {
		case "prose":
			return (
				<div className="aw-block">
					{head}
					<div className="aw-body">
						<PortableText nodes={(block.body as unknown[]) ?? []} />
					</div>
				</div>
			);
		case "note":
			return <div className="aw-note">{withTodos(String(block.body ?? ""))}</div>;
		case "terminal":
			return (
				<div className="aw-code">
					<div className="aw-code-bar">
						<i />
						<i />
						<i />
						<span>{String(block.title ?? block.language ?? "terminal")}</span>
					</div>
					<pre>{String(block.code ?? "")}</pre>
				</div>
			);
		case "faq":
			return (
				<div className="aw-block">
					{head}
					<dl className="aw-faq">
						{((block.items as Array<{ question: string; answer: string }>) ?? []).map((item, i) => (
							<div key={i}>
								<dt>{item.question}</dt>
								<dd>{withTodos(item.answer)}</dd>
							</div>
						))}
					</dl>
				</div>
			);
		case "links":
			return (
				<div className="aw-block">
					{head}
					{((block.items as Array<{ title: string; url: string; meta?: string }>) ?? []).map((item, i) => (
						<div key={i} className="aw-linkrow">
							<a href={item.url} target="_blank" rel="noreferrer">
								{item.title}
							</a>
							<span className="aw-mono aw-subtle">{item.meta ?? new URL(item.url, "https://x").hostname}</span>
						</div>
					))}
				</div>
			);
		case "cta":
			return (
				<div className="aw-block">
					{head}
					<div className="aw-cta">{accent(String(block.text ?? ""))}</div>
					<div className="aw-mono aw-subtle" style={{ marginTop: 6 }}>
						{String(block.link_label ?? "→")} · {String(block.link_url ?? "")}
					</div>
				</div>
			);
		default: {
			// Data blocks (post_list, project_grid, history, now_playing) only hold filters.
			const filters = Object.entries(block)
				.filter(([k]) => !k.startsWith("_") && k !== "label")
				.map(([k, v]) => `${k}=${String(v)}`)
				.join(" · ");
			return (
				<div className="aw-block">
					{head}
					<div className="aw-mono aw-subtle">{filters || "defaults"} — rendered from live data on the site</div>
				</div>
			);
		}
	}
}
