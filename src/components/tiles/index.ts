/**
 * Renderers for the home page's CMS tiles (profile → Home tiles). Typed
 * against the generated union, so a tile type allowed in the seed without a
 * component here fails `astro check`.
 */
import { defineBlockComponents } from "emdash/ui";
import type { ProfileTilesBlock } from "../../../emdash-env";
import LinkTile from "./LinkTile.astro";
import ListTile from "./ListTile.astro";
import PhotoTile from "./PhotoTile.astro";
import PostsTile from "./PostsTile.astro";
import TextTile from "./TextTile.astro";

export const homeTiles = defineBlockComponents<ProfileTilesBlock>({
	tile_text: TextTile,
	tile_posts: PostsTile,
	tile_link: LinkTile,
	tile_photo: PhotoTile,
	tile_list: ListTile,
});
