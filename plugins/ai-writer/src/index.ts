import type { PluginDescriptor } from "emdash";

import { DEFAULT_MAX_TOKENS, DEFAULT_MODEL, MODELS } from "./models";
import { DEFAULT_STYLE_GUIDE } from "./prompt";
import { COLLECTIONS, PATCH_FIELDS, READ_FIELDS } from "./entry-spec";

/**
 * AI writer: fills a post, project or page from one brief with Workers AI.
 * The editor panel proposes every empty prose field as one unsaved patch;
 * the "New with AI" page creates a filled-in draft. Needs the `AI` binding.
 */
export function aiWriter(): PluginDescriptor {
	return {
		id: "ai-writer",
		version: "0.1.0",
		format: "standard",
		entrypoint: "@thijmen/plugin-ai-writer/sandbox",
		capabilities: [
			"admin.editor-draft:read",
			"admin.editor-draft:patch",
			// Field list, types and block validation per collection.
			"schema:read",
			// Existing tags, for suggestions only.
			"taxonomies:read",
			// "New with AI" creates a draft; the plugin never publishes.
			"content:write",
		],
		storage: {
			runs: { indexes: ["createdAt", "collection", "entryId"] },
		},
		editorPanels: [
			{
				id: "write",
				title: "AI writer",
				route: "editor/write",
				collections: COLLECTIONS,
				draft: {
					read: { fields: READ_FIELDS },
					patch: { fields: PATCH_FIELDS },
				},
			},
		],
		adminPages: [
			{ path: "/new", label: "New with AI", icon: "magic-wand" },
			{ path: "/runs", label: "AI runs", icon: "list" },
		],
		settingsSchema: {
			model: {
				type: "select",
				label: "Model",
				description: "Workers AI text model used for every generation.",
				options: MODELS.map((m) => ({ value: m.value, label: m.label })),
				default: DEFAULT_MODEL,
			},
			styleGuide: {
				type: "string",
				label: "Style guide",
				description: "System prompt: voice and house rules. The no-invented-facts rule is always added.",
				multiline: true,
				default: DEFAULT_STYLE_GUIDE,
			},
			maxTokens: {
				type: "number",
				label: "Max output tokens",
				description: "One run writes the whole entry. Reasoning models spend part of this thinking.",
				default: DEFAULT_MAX_TOKENS,
				min: 500,
				max: 32000,
			},
		},
	};
}
