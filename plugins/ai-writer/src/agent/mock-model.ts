import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { allowedBlockTypes } from "../blocks";
import type { Target } from "../entry-spec";
import type { SessionBody } from "./types";

/**
 * A scripted stand-in for Workers AI (`AI_WRITER_MOCK=1`), so the whole
 * writer UI runs in plain `pnpm dev` without the remote binding or costs.
 * It follows the real workflow: read spec/profile/search → ask → write every
 * field → tags + validate → summary; a follow-up revises one field.
 */
export function mockWriterModel(body: SessionBody) {
	return new MockLanguageModelV4({
		provider: "mock",
		modelId: "ai-writer-mock",
		doStream: async (options) => {
			const prompt = options.prompt as Array<{ role: string; content: unknown }>;
			const lastUser = prompt.map((m) => m.role).lastIndexOf("user");
			const userTurns = prompt.filter((m) => m.role === "user").length;
			const called = new Set(
				prompt
					.slice(lastUser + 1)
					.filter((m) => m.role === "assistant" && Array.isArray(m.content))
					.flatMap((m) => (m.content as Array<{ type: string; toolName?: string }>).filter((p) => p.type === "tool-call").map((p) => p.toolName)),
			);
			const brief = textOf(prompt[lastUser]);
			const answers = lastToolOutput(prompt, "ask_user");
			return { stream: stream(nextStep(body, { first: userTurns === 1, called, brief, answers })) };
		},
	});
}

type Step = { text?: string; calls?: Array<{ toolName: string; input: unknown }> };

function nextStep(body: SessionBody, s: { first: boolean; called: Set<string | undefined>; brief: string; answers: string }): Step {
	const topic = topicOf(s.brief);
	if (!s.first) {
		if (!s.called.has("set_field")) {
			const t = body.targets.find((x) => x.kind === "text") ?? body.targets[0];
			return { text: "Revising that now.", calls: [{ toolName: "set_field", input: { field: t.field, value: sample(t, body, `${topic} (revised: ${s.brief.slice(0, 60)})`, "") } }] };
		}
		if (!s.called.has("validate_entry")) return { calls: [{ toolName: "validate_entry", input: {} }] };
		return { text: "Done. Only that field changed; the rest is as it was." };
	}
	if (!s.called.has("get_entry_spec")) {
		return {
			text: "Reading the entry's fields and your profile first.",
			calls: [
				{ toolName: "get_entry_spec", input: {} },
				{ toolName: "get_profile", input: {} },
				{ toolName: "search_content", input: { query: topic.split(" ").slice(0, 3).join(" ") } },
			],
		};
	}
	if (!s.called.has("ask_user")) {
		return {
			text: "Two facts I can't find anywhere.",
			calls: [
				{
					toolName: "ask_user",
					input: {
						questions: [
							{ question: `What made you write about ${topic} now?`, options: ["An incident at work", "A side project", "A question I keep getting"] },
							{ question: "Is there a number worth quoting (latency, error rate, cost)?" },
						],
					},
				},
			],
		};
	}
	if (!s.called.has("set_field")) {
		const order = [...body.targets].filter((t) => t.field !== "cover_caption").sort((a, b) => rank(a) - rank(b));
		return { text: "Writing the entry.", calls: order.map((t) => ({ toolName: "set_field", input: { field: t.field, value: sample(t, body, topic, s.answers) } })) };
	}
	if (!s.called.has("validate_entry")) {
		return {
			calls: [
				...(body.tags.length ? [{ toolName: "suggest_tags", input: { tags: body.tags.slice(0, 2) } }] : []),
				{ toolName: "validate_entry", input: {} },
			],
		};
	}
	return { text: `Wrote every field for "${topic}". Check the [TODO] markers before you publish; the rest follows your brief and answers.` };
}

// Body and blocks first, short fields next, title last: the order the real prompt asks for.
function rank(t: Target) {
	return { portableText: 0, blocks: 1, text: 2, string: 3, title: 4 }[t.kind];
}

function sample(t: Target, body: SessionBody, topic: string, answers: string): string {
	const why = answers || "[TODO: why now]";
	switch (t.kind) {
		case "title":
			return `Notes on *${topic}*`;
		case "string":
			return t.field === "kicker" ? `$ cat ${slug(topic)}.md` : topic;
		case "text":
			return `What ${topic} looks like in practice, and where it breaks. ${why}`.slice(0, (t.max ?? 300) - 1);
		case "portableText":
			return `## Why this came up\n\n${why}\n\n## What it looks like\n\nThe short version: ${topic} is a contract, not a feature. [TODO: the real example]\n\n\`\`\`kotlin Example.kt\nfun main() = println("${slug(topic)}")\n\`\`\`\n\n> Measure before you tune.`;
		case "blocks": {
			const allowed = allowedBlockTypes(body.collection, t.field, t.validation);
			const blocks: unknown[] = [];
			if (allowed.includes("prose")) blocks.push({ _type: "prose", label: "CONTEXT", body: `## ${topic}\n\n${why}` });
			if (allowed.includes("terminal")) blocks.push({ _type: "terminal", title: "~/demo", language: "bash", code: "pnpm dev" });
			if (allowed.includes("note")) blocks.push({ _type: "note", body: "Written by the mock model. [TODO: replace]" });
			if (allowed.includes("faq")) blocks.push({ _type: "faq", items: [{ question: `Is ${topic} worth it?`, answer: "Usually. [TODO: when it isn't]" }] });
			if (allowed.includes("post_list")) blocks.push({ _type: "post_list", label: "RELATED", limit: 3, variant: "row" });
			return JSON.stringify(blocks);
		}
	}
}

function stream(step: Step) {
	const chunks: unknown[] = [{ type: "stream-start", warnings: [] }];
	if (step.text) {
		chunks.push({ type: "text-start", id: "t" });
		for (const word of step.text.split(/(?<= )/)) chunks.push({ type: "text-delta", id: "t", delta: word });
		chunks.push({ type: "text-end", id: "t" });
	}
	for (const [i, call] of (step.calls ?? []).entries()) {
		chunks.push({ type: "tool-call", toolCallId: `mock-${Date.now()}-${i}`, toolName: call.toolName, input: JSON.stringify(call.input) });
	}
	chunks.push({
		type: "finish",
		finishReason: { unified: step.calls?.length ? "tool-calls" : "stop", raw: undefined },
		usage: {
			inputTokens: { total: 1200, noCache: 1200, cacheRead: undefined, cacheWrite: undefined },
			outputTokens: { total: 180, text: 180, reasoning: undefined },
		},
	});
	return simulateReadableStream({ chunks, initialDelayInMs: 400, chunkDelayInMs: 45 }) as ReadableStream<never>;
}

function textOf(message: { content: unknown } | undefined): string {
	if (!message) return "";
	if (typeof message.content === "string") return message.content;
	return (message.content as Array<{ type: string; text?: string }>)
		.filter((p) => p.type === "text")
		.map((p) => p.text)
		.join(" ");
}

function lastToolOutput(prompt: Array<{ role: string; content: unknown }>, toolName: string): string {
	for (let i = prompt.length - 1; i >= 0; i--) {
		const m = prompt[i];
		if (m.role !== "tool" || !Array.isArray(m.content)) continue;
		const part = (m.content as Array<{ toolName?: string; output?: { value?: unknown } }>).find((p) => p.toolName === toolName);
		if (!part) continue;
		const answers = (part.output?.value as { answers?: Array<{ answer: string | null }> } | undefined)?.answers ?? [];
		return answers.map((a) => a.answer ?? "[TODO: skipped]").join(" ");
	}
	return "";
}

function topicOf(brief: string): string {
	const first = brief.split(/[.\n]/)[0].trim().replace(/^(write|a post|an entry|about)\s+/gi, "");
	return (first || "this").slice(0, 60);
}

function slug(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "entry";
}
