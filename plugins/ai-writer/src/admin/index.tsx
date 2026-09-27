import type { PluginAdminExports } from "emdash";

import { WriterLauncher } from "./EditorPanel";
import { RunsPage } from "./RunsPage";
import { WriterPage } from "./WriterPage";

export const pages: PluginAdminExports["pages"] = {
	"/new": WriterPage,
	"/runs": RunsPage,
};

/** Editor sidebar: launch the live writer on a saved entry. */
export const contentEditorPanels = [
	{ id: "ai-writer", title: "AI writer", component: WriterLauncher, collections: ["posts", "projects", "pages"], order: 20 },
];
