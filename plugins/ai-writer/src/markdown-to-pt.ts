/**
 * Markdown (as written by the model) to Portable Text, in the node shapes the
 * site renders: h2/h3 blocks (h2 feeds the post's CONTENTS aside), blockquote
 * blocks (NOTE callout), bullet/number list items, `code` blocks with
 * `language` + optional `filename` (CodeBlock.astro), GitHub-style pipe tables
 * as EmDash `table` nodes, and strong/em/code marks plus link markDefs. Also the reverse, for sending a field back as context.
 */

export type PtSpan = { _type: "span"; _key: string; text: string; marks: string[] };
export type PtLinkDef = { _type: "link"; _key: string; href: string };
export type PtBlock = {
	_type: "block";
	_key: string;
	style: string;
	markDefs: PtLinkDef[];
	children: PtSpan[];
	listItem?: "bullet" | "number";
	level?: number;
};
export type PtCode = { _type: "code"; _key: string; code: string; language?: string; filename?: string };
export type PtTableCell = {
	_type: "tableCell";
	_key: string;
	content: PtSpan[];
	markDefs?: PtLinkDef[];
	isHeader?: boolean;
	textAlign?: "left" | "center" | "right";
};
/** EmDash's native Portable Text table (rendered by emdash/ui's Table component). */
export type PtTable = { _type: "table"; _key: string; hasHeaderRow: boolean; rows: Array<{ _type: "tableRow"; _key: string; cells: PtTableCell[] }> };
export type PtNode = PtBlock | PtCode | PtTable;

export function makeKey(): string {
	return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

// Same aliases as src/lib/highlight.ts, so fences land on a grammar Shiki has.
export const LANGUAGE_ALIASES: Record<string, string> = {
	bash: "shellscript",
	js: "javascript",
	kt: "kotlin",
	py: "python",
	sh: "shellscript",
	shell: "shellscript",
	ts: "typescript",
	yml: "yaml",
	zsh: "shellscript",
};

const FENCE = /^(`{3,}|~{3,})\s*([^\s`]*)\s*(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
// GitHub table delimiter row: | --- | :---: | ---: |
const TABLE_DELIMITER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export function markdownToPortableText(markdown: string): PtNode[] {
	const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
	const out: PtNode[] = [];
	let paragraph: string[] = [];
	let quote: string[] = [];

	const flushParagraph = () => {
		if (paragraph.length) out.push(textBlock(paragraph.join(" "), "normal"));
		paragraph = [];
	};
	const flushQuote = () => {
		if (quote.length) out.push(textBlock(quote.join(" "), "blockquote"));
		quote = [];
	};
	const flush = () => {
		flushParagraph();
		flushQuote();
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		const fence = FENCE.exec(line);
		if (fence) {
			flush();
			const close = fence[1];
			const body: string[] = [];
			while (++i < lines.length && !lines[i].trimStart().startsWith(close)) body.push(lines[i]);
			const lang = fence[2].toLowerCase();
			out.push({
				_type: "code",
				_key: makeKey(),
				code: body.join("\n"),
				...(lang ? { language: LANGUAGE_ALIASES[lang] ?? lang } : {}),
				...(fence[3].trim() ? { filename: fence[3].trim() } : {}),
			});
			continue;
		}

		if (!line.trim()) {
			flush();
			continue;
		}

		if (line.includes("|") && i + 1 < lines.length && TABLE_DELIMITER.test(lines[i + 1])) {
			flush();
			const header = splitRow(line);
			const align = splitRow(lines[i + 1]).map(alignmentOf);
			const body: string[][] = [];
			i += 2;
			while (i < lines.length && lines[i].trim() && lines[i].includes("|")) body.push(splitRow(lines[i++]));
			i--;
			out.push(tableNode(header, body, align));
			continue;
		}

		if (RULE.test(line)) {
			flush();
			continue;
		}

		const heading = HEADING.exec(line);
		if (heading) {
			flush();
			// No h1 in a body (the page title is the h1); h4+ collapse to h3.
			const style = heading[1].length <= 2 ? "h2" : "h3";
			out.push(textBlock(heading[2], style));
			continue;
		}

		const q = QUOTE.exec(line);
		if (q) {
			flushParagraph();
			if (q[1].trim()) quote.push(q[1].trim());
			continue;
		}
		flushQuote();

		const item = LIST_ITEM.exec(line);
		if (item) {
			flushParagraph();
			const level = Math.min(Math.floor(item[1].replace(/\t/g, "  ").length / 2) + 1, 4);
			const block = textBlock(item[3], "normal");
			block.listItem = /\d/.test(item[2]) ? "number" : "bullet";
			block.level = level;
			out.push(block);
			continue;
		}

		// A line directly under a list item continues it.
		const prev = out[out.length - 1];
		if (!paragraph.length && prev?._type === "block" && prev.listItem && /^\s+\S/.test(line)) {
			const extra = textBlock(line.trim(), "normal");
			prev.children.push({ _type: "span", _key: makeKey(), text: " ", marks: [] }, ...extra.children);
			prev.markDefs.push(...extra.markDefs);
			continue;
		}

		paragraph.push(line.trim());
	}
	flush();
	return out;
}

function splitRow(line: string): string[] {
	const trimmed = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
	return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function alignmentOf(delimiter: string): PtTableCell["textAlign"] {
	const d = delimiter.trim();
	if (d.startsWith(":") && d.endsWith(":")) return "center";
	if (d.endsWith(":")) return "right";
	if (d.startsWith(":")) return "left";
	return undefined;
}

function tableNode(header: string[], body: string[][], align: Array<PtTableCell["textAlign"]>): PtTable {
	const width = Math.max(header.length, ...body.map((r) => r.length));
	const cell = (text: string, column: number, isHeader: boolean): PtTableCell => {
		const { children, markDefs } = parseInline(text);
		return {
			_type: "tableCell",
			_key: makeKey(),
			content: children,
			...(markDefs.length ? { markDefs } : {}),
			...(isHeader ? { isHeader: true } : {}),
			...(align[column] ? { textAlign: align[column] } : {}),
		};
	};
	const row = (cells: string[], isHeader: boolean) => ({
		_type: "tableRow" as const,
		_key: makeKey(),
		cells: Array.from({ length: width }, (_, c) => cell(cells[c] ?? "", c, isHeader)),
	});
	return { _type: "table", _key: makeKey(), hasHeaderRow: true, rows: [row(header, true), ...body.map((r) => row(r, false))] };
}

function textBlock(text: string, style: string): PtBlock {
	const { children, markDefs } = parseInline(text);
	return { _type: "block", _key: makeKey(), style, markDefs, children };
}

/** Inline markdown: `code`, **strong**, *em* / _em_, [text](url). No nesting inside code. */
function parseInline(text: string): { children: PtSpan[]; markDefs: PtLinkDef[] } {
	const children: PtSpan[] = [];
	const markDefs: PtLinkDef[] = [];

	const push = (t: string, marks: string[]) => {
		if (!t) return;
		const last = children[children.length - 1];
		if (last && last.marks.join() === marks.join()) last.text += t;
		else children.push({ _type: "span", _key: makeKey(), text: t, marks });
	};

	const walk = (s: string, marks: string[]) => {
		const re = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|(?<![\w*])\*(?![\s*])(.+?)(?<!\s)\*(?![\w*])|(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)|\[([^\]]+)\]\(([^)\s]+)\)/g;
		let last = 0;
		for (let m = re.exec(s); m; m = re.exec(s)) {
			push(s.slice(last, m.index), marks);
			if (m[1] !== undefined) push(m[1], [...marks, "code"]);
			else if (m[2] !== undefined || m[3] !== undefined) walk(m[2] ?? m[3], [...marks, "strong"]);
			else if (m[4] !== undefined || m[5] !== undefined) walk(m[4] ?? m[5], [...marks, "em"]);
			else {
				const key = makeKey();
				markDefs.push({ _type: "link", _key: key, href: m[7] });
				walk(m[6], [...marks, key]);
			}
			last = m.index + m[0].length;
		}
		push(s.slice(last), marks);
	};

	walk(text, []);
	if (!children.length) children.push({ _type: "span", _key: makeKey(), text: "", marks: [] });
	return { children, markDefs };
}

/** Portable Text back to markdown, so rewrites see the current body in the format they answer in. */
export function portableTextToMarkdown(value: unknown): string {
	if (!Array.isArray(value)) return "";
	const parts: string[] = [];
	for (const node of value as Array<Record<string, any>>) {
		if (node?._type === "table") {
			const rows: string[][] = (node.rows ?? []).map((r: any) =>
				(r.cells ?? []).map((c: any) => spansToMarkdown(c.content ?? [], c.markDefs ?? node.markDefs ?? []).replace(/\|/g, "\\|")),
			);
			if (!rows.length) continue;
			const width = Math.max(...rows.map((r) => r.length));
			const line = (r: string[]) => `| ${Array.from({ length: width }, (_, c) => r[c] ?? "").join(" | ")} |`;
			const aligns = Array.from({ length: width }, (_, c) => {
				const a = node.rows?.[0]?.cells?.[c]?.textAlign;
				return a === "center" ? ":---:" : a === "right" ? "---:" : a === "left" ? ":---" : "---";
			});
			parts.push([line(rows[0]), `| ${aligns.join(" | ")} |`, ...rows.slice(1).map(line)].join("\n"));
			continue;
		}
		if (node?._type === "code") {
			const info = [node.language, node.filename].filter(Boolean).join(" ");
			parts.push("```" + info + "\n" + (node.code ?? "") + "\n```");
			continue;
		}
		if (node?._type !== "block") continue;
		const text = spansToMarkdown(node.children ?? [], node.markDefs ?? []);
		if (node.listItem) {
			const indent = "  ".repeat(Math.max((node.level ?? 1) - 1, 0));
			parts.push(`${indent}${node.listItem === "number" ? "1." : "-"} ${text}`);
		} else if (node.style === "h2") parts.push(`## ${text}`);
		else if (node.style === "h3") parts.push(`### ${text}`);
		else if (node.style === "blockquote") parts.push(`> ${text}`);
		else parts.push(text);
	}
	// Keep consecutive list items together; everything else is paragraph-separated.
	return parts.reduce((acc, part, i) => {
		if (i === 0) return part;
		const listy = /^\s*(-|\d+\.) /;
		return acc + (listy.test(part) && listy.test(parts[i - 1]) ? "\n" : "\n\n") + part;
	}, "");
}

function spansToMarkdown(spans: Array<{ text?: string; marks?: string[] }>, markDefs: Array<{ _key: string; href?: string }>): string {
	const defs = new Map(markDefs.map((d) => [d._key, d.href]));
	return spans
		.map((span) => {
			let t = span.text ?? "";
			for (const mark of span.marks ?? []) {
				if (mark === "strong") t = `**${t}**`;
				else if (mark === "em") t = `*${t}*`;
				else if (mark === "code") t = "`" + t + "`";
				else if (defs.has(mark)) t = `[${t}](${defs.get(mark)})`;
			}
			return t;
		})
		.join("");
}
