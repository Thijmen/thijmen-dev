import type { Target } from "../entry-spec";

/**
 * What the admin page sends with every chat request (the AI SDK `body`).
 * The agent persists the latest one, so tool continuations see it too.
 * Everything CMS-derived is fetched by the browser under the admin session.
 */
export type SessionBody = {
	collection: string;
	collectionLabel: string;
	collectionDescription: string | null;
	/** Set when revising an existing entry. */
	entryId: string | null;
	/** Writable fields, from the plugin's `spec` route. */
	targets: Target[];
	/** Current values of the entry (empty for a new one). */
	current: Record<string, unknown>;
	/** Profile facts: role, skills, links. */
	profile: Record<string, unknown>;
	/** Existing tag labels. */
	tags: string[];
	model: string;
	styleGuide: string;
	maxTokens: number;
};

export type FieldStatus = "pending" | "done" | "todo" | "error";

/** Agent state, synced live to every connected admin page. */
export type WriterState = {
	collection: string | null;
	entryId: string | null;
	targets: Array<Pick<Target, "field" | "label" | "kind">>;
	/** Values in stored form (PT arrays, blocks), ready for the save route. */
	fields: Record<string, unknown>;
	status: Record<string, FieldStatus>;
	/** Last set_field error per field, shown in the checklist. */
	errors: Record<string, string>;
	todos: number;
	tags: string[];
	/** Blocks dropped by validation, with the reason. */
	dropped: string[];
	/** Stats of the last finished turn, for the page's footer and the run log. */
	lastTurn: (TurnMetadata & { at: string }) | null;
};

export const INITIAL_STATE: WriterState = {
	collection: null,
	entryId: null,
	targets: [],
	fields: {},
	status: {},
	errors: {},
	todos: 0,
	tags: [],
	dropped: [],
	lastTurn: null,
};

/** One question in an ask_user call. */
export type Question = { question: string; options?: string[] };
export type Answer = { question: string; answer: string | null };

/** Stats of one agent turn. */
export type TurnMetadata = { model?: string; ms?: number; inputTokens?: number; outputTokens?: number };
