This is an EmDash site -- a CMS built on Astro with a full admin UI.

## Commands

```bash
pnpm dev              # Start the Astro dev server
npx emdash types      # Regenerate TypeScript types from a running site
```

The admin UI is at `http://localhost:4321/_emdash/admin`.

## Key Files

| File                     | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `astro.config.mjs`       | Astro config with `emdash()` integration, database, and storage                    |
| `src/live.config.ts`     | EmDash loader registration (boilerplate -- don't modify)                           |
| `seed/seed.json`         | Schema definition + demo content (collections, fields, taxonomies, menus, widgets) |
| `emdash-env.d.ts`        | Generated types for collections (auto-regenerated on dev server start)             |
| `src/layouts/Base.astro` | Base layout: EmDash head, theme boot script, `SiteHeader` / `SiteFooter`, glow      |
| `src/lib/content.ts`     | Shared helpers: `getProfile()`, `toPostSummary()`, `emphasize()`, reading time      |
| `src/pages/`             | Astro pages -- all server-rendered                                                 |

## Skills

Agent skills are in `.agents/skills/`. Load them when working on specific tasks:

- **building-emdash-site** -- Querying content, rendering Portable Text, schema design, seed files, site features (menus, widgets, search, SEO, comments, bylines). Start here.
- **creating-plugins** -- Building EmDash plugins with hooks, storage, admin UI, API routes, and Portable Text block types.
- **emdash-cli** -- CLI commands for content management, seeding, type generation, and visual editing flow.

## Documentation

The EmDash docs are available as an MCP server at `https://docs.emdashcms.com/mcp`. When you need to verify an API, hook, config option, field type, or pattern, call `search_docs` against the live documentation rather than relying on training-data recall. The docs reflect current behaviour; assumptions may not.

This template ships with `.mcp.json`, `.cursor/mcp.json`, and `.vscode/mcp.json` so Claude Code, Cursor, and VS Code auto-discover the docs server. Other tools (OpenCode, Windsurf, etc.) need a manual one-time setup -- see [docs.emdashcms.com/docs-mcp](https://docs.emdashcms.com/docs-mcp).

## Rules

- All content pages must be server-rendered (`output: "server"`). No `getStaticPaths()` for CMS content.
- Image fields are objects (`{ src, alt }`), not strings. Use `<Image image={...} />` from `"emdash/ui"`.
- `entry.id` is the slug (for URLs). `entry.data.id` is the database ULID (for API calls like `getEntryTerms`).
- Always call `Astro.cache.set(cacheHint)` on pages that query content.
- Taxonomy names in queries must match the seed's `"name"` field exactly (e.g., `"category"` not `"categories"`).

## Deploy & migrations

Workers Builds deploys the site: build command `pnpm build`, production deploy command `pnpm run deploy:prod`, non-production deploy command `pnpm run deploy:preview`. There is no local deploy script.

- Each deploy script applies EmDash core migrations to its D1 (`thijmen-dev` / `thijmen-dev-preview`, selected with `--account-id` + `--d1`), then deploys, then runs `emdash migrate --check`. The steps are chained with `&&`, so a failed migrate never ships code. `deploy:prod` first logs a D1 Time Travel bookmark.
- Preview must deploy with `wrangler preview`: the `previews` block in `wrangler.jsonc` (preview D1/R2/KV) only applies there. `wrangler versions upload` would bind the prod DB.
- The Worker runs with `migrations.runtime: "check"`: it returns 503 while known migrations are pending and never migrates itself. Dev stays `auto`.
- The `--expected-target-fingerprint` values in `package.json` are the reviewed targets. Update one only after `pnpm migrate:status:prod|preview` shows the intended account and database.
- The Workers Builds API token needs **D1 Edit**. Locally, the status scripts need `CLOUDFLARE_API_TOKEN` (the `wrangler login` session is not used).
- Migrations are forward-only. After an ambiguous failure, run `migrate:status:*`; don't replay blindly. Release a stuck lock with `pnpm emdash migrate --release-lock <id> ...`. To roll back, restore the D1 from the logged Time Travel bookmark together with the matching build.
- All branches share the preview D1. If a branch with a newer EmDash migrated it, older branches fail their build on unknown migration records: rebase, or reset preview from a prod export.

## This Site

Personal site of Thijmen Stavenuiter, Staff Engineer: a blog, resume, open-source projects and a /uses page. The design came from a claude.ai/design project ("Responsive Preview"). Its voice is an engineer's terminal: `$ ls -lt blog/`, `~/.profile` windows, git-log timelines, `man thijmen`, a ⌘K command palette. Near-monochrome surfaces with one purple accent.

## Pages

| Page     | Path           | What it shows                                                                                           |
| -------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| Home     | `/`            | Status pill, big serif name, intro, `~/.profile` window; WRITING (1 feature + 3 rows); HISTORY; 2 featured projects; mail CTA |
| Blog     | `/blog`        | `wc -l` kicker, tag chips (`?tag=slug`, server-side), latest post as a wide feature card, grid of the rest |
| Post     | `/blog/[slug]` | Progress bar, title (with `*accent*`), date/read-time/tag chips, 21:9 cover, Portable Text body, sticky CONTENTS aside, older/newer |
| Resume   | `/resume`      | Name + role, Download PDF (`window.print()`, print CSS hides chrome), full git-log timeline, `skills.yml`, contact card |
| Projects | `/projects`    | Project cards: screenshot, status pill, description, install command, language + stars                 |
| Uses     | `/uses`        | Simulated now-playing card (no audio) + queue + playlists, tools with client-side category filter, desk |

Old portfolio routes redirect: `/work` and `/work/*` → `/projects`, `/about` → `/resume`, `/contact` → `/` (config `redirects` plus `src/pages/work/[slug].astro`).

## Schema

- `posts`: `title` (may contain `*emphasis*`), `date` (datetime, used for ordering), `excerpt`, `featured_image`, `cover_caption`, `content` (Portable Text). Taxonomy `tag`. Reading time is computed, not stored.
- `projects`: `title` (repo name), `summary`, `featured_image`, `language`, `project_status` (select: active/maintained/archived), `stars`, `install`, `url`, `featured` (boolean, home page), `position`.
- `roles`: `title`, `org`, `period`, `commit_hash`, `ref`, `summary`, `highlights` (json string[]), `additions`, `deletions`, `stack` (json string[]), `position`.
- `tools`, `desk_items`, `tracks`, `playlists`: small ordered lists for `/uses`, all sorted by `position`.
- `profile`: exactly one entry with slug `me`. It holds all site-wide copy: status line, intros, page titles, CTA cards, email/GitHub/LinkedIn, `profile_lines` and `skills` (json), desk photo. Read it with `getProfile()`.
- Single `primary` menu: Home, Blog, Resume, Projects, Uses. The header derives the `g` + first-letter shortcuts from the labels.

Gotchas found while building this:
- `status` is a reserved field slug (hence `project_status`). `validateSeed` does not catch it; only apply does.
- `where` on a collection only takes strings: filter booleans with `"1"`.
- Collection entries carry taxonomy terms on `entry.data.terms.<taxonomy>`.
- The runtime auto-seed applies schema only. Sample content comes from the setup wizard or `/_emdash/api/setup/dev-bypass` in dev.
- EmDash groups only runs of 2+ blockquote blocks into `blockquoteGroup`; a lone blockquote reaches the `block` renderer. `src/components/pt/Block.astro` handles both as the NOTE callout.

## Visual character

Three faces, loaded through the Fonts API in `astro.config.mjs`:
- **Newsreader** (`--font-heading`): serif for display titles, card titles, post body and italic accents.
- **Geist** (`--font-body`): UI and body sans.
- **JetBrains Mono** (`--font-mono`): kickers, meta lines, chips, terminal windows and code.

Colour is oklch: near-white/near-black lilac-tinted neutrals and one purple accent (`--color-brand`) with a soft tint (`--color-brand-soft`). Headings mark an accent phrase in italic brand colour. Editors write `*phrase*` in CMS text and `emphasize()` renders it. A soft radial glow sits behind the top of each page (`glow="left" | "right"` on `Base`). The syntax colours (`--syntax-*`) are the only other hues; they are for code and terminal windows.

Theme: `data-theme="light" | "dark"` on `<html>`, stored in `localStorage["ts-theme"]` and falling back to the OS preference. Toggle with the header button, the palette, or the `t` key.

## Customisation

Design tokens live in `src/styles/tokens.css` (`light-dark()` pairs, pinned by `data-theme`). Shared building blocks (`.page`, `.hero`, `.display`, `.kicker`, `.btn`, `.chip`, `.card`, `.accent-card`, `.placeholder`, `.cursor`) live in `src/styles/components.css`. Both are in `@layer base`, so unlayered overrides in `src/styles/theme.css` always win.

Components (`src/components/`): `SiteHeader` (nav pill, ☰ menu below 760px, ⌘K palette, keyboard shortcuts; one vanilla client script), `SiteFooter`, `Window` (terminal chrome), `SectionLabel`, `Timeline` (compact/full), `PostCard` (feature/row/grid), `ProjectCard` (full/compact). Portable Text overrides are in `pt/`: `Block` (h2 ids for the TOC, NOTE callout), `Note`, `CodeBlock` (window chrome, line numbers, copy button).

Code highlighting uses `src/lib/highlight.ts`: Shiki's fine-grained core with a fixed grammar list and the JavaScript regex engine. Don't switch to Astro's `<Code>`; it bundles every grammar plus the WASM engine into the Worker. Add a language by adding it to `LANGS`.

Styling a child component through its `class` prop needs `:global()` in the parent: Astro scopes styles per component.

## What not to do

- Don't add a second accent colour or coloured section backgrounds. The purple accent, its soft tint and the fixed-dark player card are the whole palette.
- Don't use drop shadows on cards. Shadows exist only on floating layers (menu dropdown, palette).
- Don't hardcode copy that belongs in the `profile` entry or a collection. The site is meant to be fully CMS-driven.
- Don't write generic copy ("Welcome to my blog"). Keep it specific and dry, in the terminal/git voice.
- Don't add JS frameworks for interactivity. The header, palette, filters and player are small vanilla scripts.
