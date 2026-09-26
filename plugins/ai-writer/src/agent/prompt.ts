import { allowedBlockTypes, describeBlockTypes, maxBlocks } from "../blocks";
import type { Target } from "../entry-spec";
import { FORMAT, formatValue } from "../prompt";
import type { SessionBody } from "./types";

/** The WriterAgent's system prompt: voice, facts rule, workflow. The field spec comes from get_entry_spec. */
export function agentSystemPrompt(body: SessionBody): string {
	const revising = body.entryId !== null;
	return [
		body.styleGuide.trim(),
		`Facts: never invent anything about Thijmen or anything checkable (employers, roles, dates, team sizes, metrics, incidents, project names, quotes, links, versions). Use what the brief, get_profile, search_content and fetch_url give you. When you need a fact you can't find, ask Thijmen with ask_user. Only if he skips a question, write a visible placeholder like [TODO: which payment provider].`,
		`You are the writing agent in the thijmen.dev admin, ${revising ? "revising an existing" : "writing a new"} ${body.collectionLabel.toLowerCase()} (collection \`${body.collection}\`). Thijmen watches every tool call and field land live, so work in visible steps:
1. get_entry_spec (fields, formats${revising ? ", current values" : ""}) and get_profile. Use search_content when related posts, projects or links would help, and fetch_url for pages the brief links to (only URLs from the brief or from search results).
2. If facts are missing, one ask_user call with up to 3 short, specific questions (offer options when you can guess). Don't ask about things you can phrase around.
3. Write each field with set_field: body/blocks first, then the short fields, title last so it fits what you wrote. ${revising ? "Keep fields that already have content unless the brief asks to change them." : "Fill every field; leave one out only when its description says so."} If set_field returns an error, fix the value and call it again.
4. suggest_tags (only when tags exist), then validate_entry, and fix what it reports.
5. End with one or two plain sentences: what you wrote and what's left for Thijmen. Never paste the content into the chat.
On a follow-up message, change only what it asks (set_field again), then validate_entry.`,
	].join("\n\n");
}

/** The get_entry_spec result: every writable field with its purpose, format and (when revising) current value. */
export function entrySpecForModel(body: SessionBody) {
	return {
		collection: body.collection,
		type: body.collectionLabel,
		description: body.collectionDescription,
		fields: body.targets.map((t) => fieldSpec(t, body)),
		note: "Pass set_field values as: plain text for text fields, Markdown for Portable Text, a JSON array string for blocks.",
	};
}

function fieldSpec(t: Target, body: SessionBody) {
	const current = formatValue(body.current[t.field]);
	return {
		field: t.field,
		label: t.label,
		purpose: t.purpose,
		format: FORMAT[t.kind] + (t.max ? `, at most ${t.max} characters` : ""),
		...(t.kind === "blocks"
			? {
					maxBlocks: maxBlocks(t.validation),
					blockTypes: describeBlockTypes(allowedBlockTypes(body.collection, t.field, t.validation)),
				}
			: {}),
		...(current ? { current: current.length > 6000 ? `${current.slice(0, 6000)}…` : current } : {}),
	};
}
