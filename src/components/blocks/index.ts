/**
 * Block renderers per blocks field. Each map is typed against the field's
 * generated union, so a type allowed in the schema without a component here
 * fails `astro check`. Keep these in step with `allowedTypes` in the seed.
 */
import { defineBlockComponents } from "emdash/ui";
import type { PageBodyBlock, PostSectionsBlock, ProjectBodyBlock } from "../../../emdash-env";
import CtaBlock from "./CtaBlock.astro";
import FaqBlock from "./FaqBlock.astro";
import FigureBlock from "./FigureBlock.astro";
import GalleryBlock from "./GalleryBlock.astro";
import HistoryBlock from "./HistoryBlock.astro";
import LinksBlock from "./LinksBlock.astro";
import NoteBlock from "./NoteBlock.astro";
import NowPlayingBlock from "./NowPlayingBlock.astro";
import PostListBlock from "./PostListBlock.astro";
import ProjectGridBlock from "./ProjectGridBlock.astro";
import ProseBlock from "./ProseBlock.astro";
import TerminalBlock from "./TerminalBlock.astro";

export { default as MissingBlock } from "./Missing.astro";

export const postSections = defineBlockComponents<PostSectionsBlock>({
	note: NoteBlock,
	figure: FigureBlock,
	gallery: GalleryBlock,
	cta: CtaBlock,
	links: LinksBlock,
	faq: FaqBlock,
	post_list: PostListBlock,
});

export const projectBody = defineBlockComponents<ProjectBodyBlock>({
	prose: ProseBlock,
	note: NoteBlock,
	terminal: TerminalBlock,
	figure: FigureBlock,
	gallery: GalleryBlock,
	links: LinksBlock,
	faq: FaqBlock,
});

export const pageBody = defineBlockComponents<PageBodyBlock>({
	prose: ProseBlock,
	note: NoteBlock,
	terminal: TerminalBlock,
	figure: FigureBlock,
	gallery: GalleryBlock,
	cta: CtaBlock,
	links: LinksBlock,
	faq: FaqBlock,
	post_list: PostListBlock,
	project_grid: ProjectGridBlock,
	history: HistoryBlock,
	now_playing: NowPlayingBlock,
});
