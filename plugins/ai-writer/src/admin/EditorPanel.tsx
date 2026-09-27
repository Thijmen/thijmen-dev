/** @jsxImportSource react */
import { Button } from "@cloudflare/kumo";
import { MagicWandIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { css } from "./styles";

type PanelProps = { collection: string; entry: { id: string; data?: Record<string, unknown> }; locale?: string };

/**
 * Editor sidebar launcher: opens the live writer on this entry, optionally
 * with what should change, and starts right away. The writer works from the
 * saved version and saves draft changes back.
 */
export function WriterLauncher({ collection, entry }: PanelProps) {
	const [brief, setBrief] = useState("");
	const open = () => {
		const q = new URLSearchParams({ collection, id: entry.id, start: "1" });
		if (brief.trim()) q.set("brief", brief.trim());
		window.location.assign(`/_emdash/admin/plugins/ai-writer/new?${q}`);
	};
	return (
		<div className="aw" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
			<style>{css}</style>
			<p className="aw-subtle" style={{ margin: 0, fontSize: 13 }}>
				Fill the empty fields or revise this entry with the writer. It reads the saved version, asks what it needs, and saves draft changes.
			</p>
			<textarea
				className="aw-input"
				rows={3}
				placeholder="What should change? (optional)"
				value={brief}
				onChange={(e) => setBrief(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) open();
				}}
			/>
			<Button variant="secondary" icon={MagicWandIcon} onClick={open}>
				Open AI writer
			</Button>
			<p className="aw-subtle" style={{ margin: 0, fontSize: 12 }}>
				Save your edits here first.
			</p>
		</div>
	);
}
