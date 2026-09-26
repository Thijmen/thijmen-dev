/** @jsxImportSource react */
import { Button, Loader } from "@cloudflare/kumo";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";

import { MODELS } from "../models";
import type { Run } from "../runtime";
import { api, editorUrl } from "./api";
import { css } from "./styles";

const labels = new Map<string, string>(MODELS.map((m) => [m.value, m.label]));

function ago(iso: string): string {
	const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
	if (s < 60) return `${s}s ago`;
	if (s < 3600) return `${Math.round(s / 60)}m ago`;
	if (s < 86400) return `${Math.round(s / 3600)}h ago`;
	return new Date(iso).toLocaleDateString();
}

/** The last 50 runs from the live writer and the editor panel's quick fill. */
export function RunsPage() {
	const [runs, setRuns] = useState<Run[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const load = useCallback(async () => {
		setError(null);
		try {
			setRuns((await api.runs()).runs);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);
	useEffect(() => {
		void load();
	}, [load]);

	return (
		<div className="aw">
			<style>{css}</style>
			<div className="aw-head">
				<h1>AI runs</h1>
				<span className="aw-subtle">One row per writer turn or panel fill.</span>
				<span className="aw-pill" style={{ padding: 0, border: 0, background: "none" }}>
					<Button size="sm" variant="secondary" icon={ArrowClockwiseIcon} onClick={() => void load()}>
						Refresh
					</Button>
				</span>
			</div>
			{error && <div className="aw-banner error">{error}</div>}
			{!runs && !error && <Loader />}
			{runs && runs.length === 0 && <p className="aw-subtle">No runs yet. Start one under New with AI.</p>}
			{runs && runs.length > 0 && (
				<div className="aw-panel">
					<table className="aw-table">
						<thead>
							<tr>
								<th>When</th>
								<th>Status</th>
								<th>Where</th>
								<th>Entry</th>
								<th>Model</th>
								<th>Tokens in/out</th>
								<th>Time</th>
								<th>Brief / error</th>
							</tr>
						</thead>
						<tbody>
							{runs.map((r, i) => (
								<tr key={i}>
									<td className="aw-mono" title={r.createdAt}>
										{ago(r.createdAt)}
									</td>
									<td>
										<span className={`aw-status ${r.status}`}>{r.status}</span>
									</td>
									<td>{r.source === "panel" ? `panel${r.field !== "*" ? ` · ${r.field}` : ""}` : "writer"}</td>
									<td>
										{r.entryId ? (
											<a className="aw-link" href={editorUrl(r.collection, r.entryId)}>
												{r.collection}
											</a>
										) : (
											<span className="aw-subtle">{r.collection} (unsaved)</span>
										)}
									</td>
									<td>{labels.get(r.model) ?? r.model}</td>
									<td className="aw-mono">{r.inputTokens != null ? `${r.inputTokens} / ${r.outputTokens}` : "–"}</td>
									<td className="aw-mono">{(r.ms / 1000).toFixed(1)}s</td>
									<td style={{ maxWidth: 360 }}>
										{r.status === "error" ? (
											<span style={{ color: "var(--aw-danger)" }}>{r.error}</span>
										) : (
											<>
												{r.brief.slice(0, 120)}
												{r.todos ? <span className="aw-subtle"> · {r.todos} TODO</span> : null}
											</>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
