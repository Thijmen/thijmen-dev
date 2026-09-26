/**
 * Portable Text component map shared by post bodies and the `prose` block:
 * h2 ids for the TOC, the NOTE callout for blockquotes, and code windows.
 */
import Block from "./Block.astro";
import CodeBlock from "./CodeBlock.astro";
import Note from "./Note.astro";

export const ptComponents = {
	block: Block,
	type: { code: CodeBlock, blockquoteGroup: Note },
};
