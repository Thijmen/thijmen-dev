import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, tool, toUIMessageStream } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";

import { hasValue, matchTags, toFieldValue } from "../field-values";
import { fetchUrl } from "./fetch-url";
import { mockWriterModel } from "./mock-model";
import { agentSystemPrompt, entrySpecForModel } from "./prompt";
import { type FieldStatus, INITIAL_STATE, type SessionBody, type TurnMetadata, type WriterState } from "./types";

type AgentEnv = Cloudflare.Env & { AI_WRITER_MOCK?: string };

/**
 * The AI writer's engine: one Durable Object per writing session (the
 * instance name is the session id in the admin page's URL). Runs a
 * tool-calling loop on Workers AI and streams it to the page. It holds no
 * CMS access: CMS reads arrive in the request body or through client-side
 * tools the browser answers under the admin session, and saving is a
 * button on the page.
 */
export class WriterAgent extends AIChatAgent<AgentEnv, WriterState> {
	initialState = INITIAL_STATE;
	maxPersistedMessages = 200;

	async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions): Promise<Response | undefined> {
		const body = options?.body as SessionBody | undefined;
		if (!body?.collection || !Array.isArray(body.targets)) {
			throw new Error("Missing session: reload the AI writer page");
		}
		this.syncSession(body);

		const mock = this.env.AI_WRITER_MOCK === "1";
		const model = mock ? mockWriterModel(body) : createWorkersAI({ binding: this.env.AI })(body.model as never);
		const started = Date.now();

		const result = streamText({
			model,
			system: agentSystemPrompt(body),
			messages: await convertToModelMessages(this.messages),
			tools: this.tools(body),
			stopWhen: isStepCount(24),
			maxOutputTokens: body.maxTokens,
			abortSignal: options?.abortSignal,
			// ai-chat replaces finish metadata with the finish reason, so turn stats travel in state.
			onFinish: ({ usage }) => {
				const turn: TurnMetadata = {
					model: mock ? "mock" : body.model,
					ms: Date.now() - started,
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
				};
				this.setState({ ...this.state, lastTurn: { ...turn, at: new Date().toISOString() } });
			},
		});

		return createUIMessageStreamResponse({
			stream: toUIMessageStream({
				stream: result.stream,
				// Admin-only surface: show the real reason (e.g. no Workers AI in local dev).
				onError: (error) => (error instanceof Error ? error.message : String(error)),
			}),
		});
	}

	/** Start or continue the entry this session writes; a different entry resets the draft state. */
	private syncSession(body: SessionBody) {
		const targets = body.targets.map(({ field, label, kind }) => ({ field, label, kind }));
		if (this.state.collection === body.collection && this.state.entryId === body.entryId) {
			this.setState({ ...this.state, targets });
			return;
		}
		const fields: Record<string, unknown> = {};
		const status: Record<string, FieldStatus> = {};
		for (const t of body.targets) {
			const value = body.current[t.field];
			if (hasValue(value)) fields[t.field] = value;
			status[t.field] = hasValue(value) ? (JSON.stringify(value).includes("[TODO:") ? "todo" : "done") : "pending";
		}
		this.setState({ ...INITIAL_STATE, collection: body.collection, entryId: body.entryId, targets, fields, status, todos: countTodos(fields) });
	}

	private tools(body: SessionBody) {
		const byField = new Map(body.targets.map((t) => [t.field, t]));
		const fieldList = body.targets.map((t) => t.field).join(", ");

		return {
			get_entry_spec: tool({
				description: "The fields of this entry: what each is for, its format, block types, and current values. Call first.",
				inputSchema: z.object({}),
				execute: async () => entrySpecForModel(body),
			}),

			get_profile: tool({
				description: "Thijmen's real facts from the site profile: role, status, skills, links. Use them; never contradict them.",
				inputSchema: z.object({}),
				execute: async () => body.profile,
			}),

			// Client tool: the admin page runs it through the plugin's `search` route.
			search_content: tool({
				description: "Search existing posts and projects on the site by keyword. Returns title, excerpt, URL, tags. Use for internal links, related posts and post_list tags.",
				inputSchema: z.object({
					query: z.string().describe("A few keywords"),
					collection: z.enum(["posts", "projects"]).optional(),
				}),
			}),

			fetch_url: tool({
				description: "Read a web page as plain text (first ~40 KB). Only for URLs from the brief or from search results.",
				inputSchema: z.object({ url: z.string() }),
				execute: async ({ url }) => fetchUrl(url),
			}),

			// Client tool: the page shows the questions and returns Thijmen's answers.
			ask_user: tool({
				description: "Ask Thijmen up to 3 short questions about facts you can't find. Offer options when you can guess. An answer of null means he skipped it: write a [TODO: …] there.",
				inputSchema: z.object({
					questions: z
						.array(z.object({ question: z.string(), options: z.array(z.string()).max(5).optional() }))
						.min(1)
						.max(3),
				}),
			}),

			set_field: tool({
				description: `Write one field of the entry. Fields: ${fieldList}. Value: plain text for text fields, Markdown for Portable Text, a JSON array (as a string) for blocks.`,
				inputSchema: z.object({ field: z.string(), value: z.string() }),
				execute: async ({ field, value }) => {
					const target = byField.get(field);
					if (!target) return { ok: false, error: `Unknown field "${field}". Fields: ${fieldList}` };
					try {
						const { value: stored, dropped } = toFieldValue(value, target, body.collection);
						const fields = { ...this.state.fields, [field]: stored };
						const todos = countTodos({ [field]: stored });
						const errors = { ...this.state.errors };
						delete errors[field];
						this.setState({
							...this.state,
							fields,
							status: { ...this.state.status, [field]: todos ? "todo" : "done" },
							errors,
							todos: countTodos(fields),
							dropped: [...this.state.dropped.filter((d) => !d.startsWith(`${field}:`)), ...dropped.map((d) => `${field}: ${d}`)],
						});
						const warnings = [
							...dropped.map((d) => `dropped block (${d})`),
							...(target.kind === "title" && !/\*[^*]+\*/.test(String(stored)) ? ["the title has no *accent* phrase"] : []),
						];
						return { ok: true, field, todos, ...(warnings.length ? { warnings } : {}) };
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						this.setState({
							...this.state,
							status: { ...this.state.status, [field]: "error" },
							errors: { ...this.state.errors, [field]: message },
						});
						return { ok: false, field, error: message };
					}
				},
			}),

			suggest_tags: tool({
				description: "Suggest up to 4 tags for this entry, only from the existing tags. Thijmen ticks them in the editor.",
				inputSchema: z.object({ tags: z.array(z.string()).max(4) }),
				execute: async ({ tags }) => {
					const matched = matchTags(
						tags.join(","),
						body.tags.map((label) => ({ label, slug: label.toLowerCase().replace(/\s+/g, "-") })),
					);
					this.setState({ ...this.state, tags: matched });
					return { tags: matched, ...(matched.length < tags.length ? { ignored: "only existing tags count", existing: body.tags } : {}) };
				},
			}),

			validate_entry: tool({
				description: "Check the entry before finishing: missing fields, errors, [TODO] markers.",
				inputSchema: z.object({}),
				execute: async () => {
					const missing = body.targets.filter((t) => !hasValue(this.state.fields[t.field])).map((t) => t.field);
					const title = body.targets.find((t) => t.kind === "title");
					return {
						ok: !missing.filter((f) => f === title?.field).length && !Object.keys(this.state.errors).length,
						missing,
						errors: this.state.errors,
						todos: this.state.todos,
						...(title && !hasValue(this.state.fields[title.field]) ? { required: `${title.field} is required` } : {}),
					};
				},
			}),
		};
	}
}

function countTodos(fields: Record<string, unknown>): number {
	return JSON.stringify(fields).match(/\[TODO:/g)?.length ?? 0;
}
