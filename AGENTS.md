This is an EmDash site -- a CMS built on Astro with a full admin UI.

## Commands

```bash
pnpm dev              # Start the Astro dev server (local bindings only, no Workers AI)
pnpm dev:ai           # Same, plus remote bindings so the AI writer uses the real model
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
- Prod sets `EMDASH_SITE_URL` in `wrangler.jsonc` `vars` (read through `nodejs_compat_populate_process_env`). EmDash 0.41's setup wizard refuses to run without a configured site URL. Previews have no fixed hostname: to rerun the wizard on a reset preview D1, add the branch's preview URL to `previews.vars` in a temporary commit and revert it afterwards.
- The Worker runs with `migrations.runtime: "check"`: it returns 503 while known migrations are pending and never migrates itself. Dev stays `auto`.
- The `--expected-target-fingerprint` values in `package.json` are the reviewed targets. Update one only after `pnpm migrate:status:prod|preview` shows the intended account and database.
- The Workers Builds API token needs **D1 Edit**. Locally, the status scripts need `CLOUDFLARE_API_TOKEN` (the `wrangler login` session is not used).
- Migrations are forward-only. After an ambiguous failure, run `migrate:status:*`; don't replay blindly. Release a stuck lock with `pnpm emdash migrate --release-lock <id> ...`. To roll back, restore the D1 from the logged Time Travel bookmark together with the matching build.
- Spotify secrets: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` (`wrangler secret put`, plus `.dev.vars` locally). Get the refresh token with `node scripts/spotify-auth.mjs` (redirect URI `http://127.0.0.1:8888/callback`).
- Schema changes don't ship with a deploy: the seed only applies to an empty DB. The blocks schema (block types, `pages`, `posts.sections`, `projects.body`) reaches preview/prod through `EMDASH_URL=… EMDASH_TOKEN=… pnpm schema:blocks [--dry-run]` (`scripts/apply-blocks-schema.mjs`). It reads the definitions from `seed/seed.json`, creates only what is missing, reports (never changes) anything that differs, and never touches content. The token needs `schema:write` (admin → Settings → API Tokens on that environment). Access guards the whole Worker, API included, so also set `CF_ACCESS_TOKEN` (the `CF_Authorization` cookie from a browser session on that hostname) or a service token via `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET`. Order: deploy the renderer code first, then run it against preview, then prod.
- All branches share the preview D1. If a branch with a newer EmDash migrated it, older branches fail their build on unknown migration records: rebase, or reset preview from a prod export.

## Dependency updates

- Renovate (`renovate.json`) opens grouped PRs Monday mornings; the Dependency Dashboard issue lists everything pending. `.github/workflows/ci.yml` (install, `astro check`, build) gates them.
- Minor/patch of `wrangler`, `@cloudflare/workers-types` (monthly), `@astrojs/check` and `shiki` automerge on green CI. Astro, React and all majors wait for review.
- EmDash (`emdash`, `@emdash-cms/*`) needs approval in the dashboard before Renovate creates a branch, because that branch's preview deploy migrates the shared preview D1. Merge it by hand, then check `pnpm migrate:status:prod`.
- Renovate's `minimumReleaseAge` mirrors the pnpm cooldown in `pnpm-workspace.yaml`; change both together.

## This Site

Personal site of Thijmen Stavenuiter, Staff Engineer: a blog, resume, open-source projects and a /uses page. The design came from a claude.ai/design project ("Responsive Preview"). Its voice is an engineer's terminal: `$ ls -lt blog/`, `~/.profile` windows, git-log timelines, `man thijmen`, a ⌘K command palette. Near-monochrome surfaces with one purple accent.

## Pages

| Page     | Path           | What it shows                                                                                           |
| -------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| Home     | `/`            | Status pill, big serif name, intro, `~/.profile` window; WRITING (1 feature + 3 rows); HISTORY; 2 featured projects; mail CTA |
| Blog     | `/blog`        | `wc -l` kicker, tag chips (`?tag=slug`, server-side), latest post as a wide feature card, grid of the rest |
| Post     | `/blog/[slug]` | Progress bar, title (with `*accent*`), date/read-time/tag chips, 21:9 cover, Portable Text body, `sections` blocks, sticky CONTENTS aside, older/newer |
| Resume   | `/resume`      | Name + role, Download PDF (`window.print()`, print CSS hides chrome), full git-log timeline, `skills.yml`, contact card |
| Projects | `/projects`    | Project cards: screenshot, status pill, description, install command, language + stars. A card links to its case study when `body` has blocks, else to the repo |
| Project  | `/projects/[slug]` | Case study: card fields as a header, 21:9 screenshot, `body` blocks                               |
| Uses     | `/uses`        | `Soundtrack` (Spotify now-playing card, live, polls `/api/now-playing`, + top tracks queue + playlists), tools with client-side category filter, desk |
| Pages    | `/[slug]`      | `pages` entries (/now, /colophon): kicker + display title + lede hero, then `body` blocks. Static routes win |

Old portfolio routes redirect: `/work` → `/projects`, `/work/<slug>` → that project's case study if it has one, else `/projects`, `/about` → `/resume`, `/contact` → `/` (config `redirects` plus `src/pages/work/[slug].astro`).

## Schema

- `posts`: `title` (may contain `*emphasis*`), `date` (datetime, used for ordering), `excerpt`, `featured_image`, `cover_caption`, `content` (Portable Text). Taxonomy `tag`. Reading time is computed, not stored.
- `projects`: `title` (repo name), `summary`, `featured_image`, `language`, `project_status` (select: active/maintained/archived), `stars`, `install`, `url`, `featured` (boolean, home page), `position`.
- `posts.sections` and `projects.body` are `blocks` fields, as is `pages.body`.
- `pages`: `title` (`*accent*`), `kicker`, `lede`, `glow` (left/right), `description` (SEO), `og_image`, `body` (blocks). Served at `/<slug>`.
- `roles`: `title`, `org`, `period`, `commit_hash`, `ref`, `summary`, `highlights` (json string[]), `additions`, `deletions`, `stack` (json string[]), `position`.
- `tools`, `desk_items`, `tracks`, `playlists`: small ordered lists for `/uses`, all sorted by `position`.
- Spotify (`src/lib/spotify.ts`) feeds SOUNDTRACK: now playing / last played, top tracks (`short_term`) and, per `playlists` entry, name/cover/`N tracks · Xh Ym` from its `url` (a Spotify playlist URL). CMS `tracks` and playlist `title`/`meta` are the fallback when Spotify is unconfigured or fails; then the player simulates playback as before. Responses are memoised in the Workers Cache API (now playing 20s, top tracks 1h, playlists 6h). Since Spotify's Feb 2026 API changes, track counts only come back for playlists the account owns.
- `profile`: exactly one entry with slug `me`. It holds all site-wide copy: status line, intros, page titles, CTA cards, email/GitHub/LinkedIn, `profile_lines` and `skills` (json), desk photo. Read it with `getProfile()`.
- Block types (seed `blockTypes`, all v1): content `prose`, `note`, `terminal`, `figure`, `gallery`, `cta`, `links`, `faq`; data `post_list`, `project_grid`, `history`, `now_playing`. Data blocks store filters (tag, limit, variant, featured-only) and query collections themselves, because block fields can't hold references. `allowedTypes`: `posts.sections` = note, figure, gallery, cta, links, faq, post_list; `projects.body` = prose, note, terminal, figure, gallery, links, faq; `pages.body` = all. Renderers are in `src/components/blocks/`; `index.ts` has one `defineBlockComponents` map per field, typed against the generated `PostSectionsBlock` / `ProjectBodyBlock` / `PageBodyBlock` unions, so `astro check` fails when an allowed type has no component.
- Single `primary` menu: Home, Blog, Resume, Projects, Uses (+ Now, Colophon in the seed). The header derives the `g` + first-letter shortcuts from the labels.

Gotchas found while building this:
- `status` is a reserved field slug (hence `project_status`). `validateSeed` does not catch it; only apply does.
- `where` on a collection only takes strings: filter booleans with `"1"`.
- Collection entries carry taxonomy terms on `entry.data.terms.<taxonomy>`.
- The runtime auto-seed applies schema only. Sample content comes from the setup wizard or `/_emdash/api/setup/dev-bypass` in dev.
- Block fields only take `string, text, url, number, integer, boolean, datetime, select, multiSelect, portableText, image, file, repeater`. No references, JSON or nested blocks. Removing a field, changing a type or adding a required field is a breaking change: it creates a new inactive version, which the renderer must handle before you activate it. `_version` is on every stored block.
- `<Blocks>` renders its items without a wrapper and passes only `value`, `index` and `blockKey`. A block that needs page context reads `Astro.url` (`post_list` uses it to skip the post it sits under).
- EmDash groups only runs of 2+ blockquote blocks into `blockquoteGroup`; a lone blockquote reaches the `block` renderer. `src/components/pt/Block.astro` handles both as the NOTE callout.

## Visual character

Three faces, loaded through the Fonts API in `astro.config.mjs`:
- **Newsreader** (`--font-heading`): serif for display titles, card titles, post body and italic accents.
- **Geist** (`--font-body`): UI and body sans.
- **JetBrains Mono** (`--font-mono`): kickers, meta lines, chips, terminal windows and code.

Colour is oklch: near-white/near-black lilac-tinted neutrals and one purple accent (`--color-brand`) with a soft tint (`--color-brand-soft`). Headings mark an accent phrase in italic brand colour. Editors write `*phrase*` in CMS text and `emphasize()` renders it. A soft radial glow sits behind the top of each page (`glow="left" | "right"` on `Base`). The syntax colours (`--syntax-*`) are the only other hues; they are for code and terminal windows.

Theme: `data-theme="light" | "dark"` on `<html>`, stored in `localStorage["ts-theme"]` and falling back to the OS preference. Toggle with the header button, the palette, or the `t` key.

## Customisation

Design tokens live in `src/styles/tokens.css` (`light-dark()` pairs, pinned by `data-theme`). Shared building blocks (`.page`, `.hero`, `.display`, `.kicker`, `.btn`, `.chip`, `.card`, `.accent-card`, `.prose`, `.placeholder`, `.cursor`) live in `src/styles/components.css`. Both are in `@layer base`, so unlayered overrides in `src/styles/theme.css` always win.

Components (`src/components/`): `SiteHeader` (nav pill, ☰ menu below 760px, ⌘K palette, keyboard shortcuts; one vanilla client script), `SiteFooter`, `Window` (terminal chrome), `SectionLabel`, `Timeline` (compact/full), `PostCard` (feature/row/grid), `ProjectCard` (full/compact, optional `href`), `Soundtrack` (the Spotify player; `/uses` and the `now_playing` block). Portable Text overrides are in `pt/`: `Block` (h2 ids for the TOC, NOTE callout), `Note`, `CodeBlock` (window chrome, line numbers, copy button), and `components.ts` (the map shared by posts and the `prose` block). Block renderers are in `blocks/`, all framed by `BlockSection` (optional SectionLabel; `narrow` = the 700px reading measure).

Code highlighting uses `src/lib/highlight.ts`: Shiki's fine-grained core with a fixed grammar list and the JavaScript regex engine. Don't switch to Astro's `<Code>`; it bundles every grammar plus the WASM engine into the Worker. Add a language by adding it to `LANGS`, and to the `terminal` block's `language` options (a compatible change: same version).

Styling a child component through its `class` prop needs `:global()` in the parent: Astro scopes styles per component.

## AI writer plugin

`plugins/ai-writer` is a local workspace package and a **native** EmDash plugin: runtime `src/runtime.ts`, React admin `src/admin/`, and a Durable Object agent `src/agent/`. It writes a whole post, project or page with Workers AI while you watch.

- **New with AI** (admin sidebar, `/_emdash/admin/plugins/ai-writer/new`): pick a type, write a brief, press Write.
  - The left pane streams the agent's steps with timings: reading the fields and your profile, searching the site, fetching linked pages, writing each field, picking tags, validating.
  - The right pane is a live preview in the site's look; fields fill in as they're written.
  - Questions show up inline when facts are missing. Skipping one leaves a `[TODO: …]`, highlighted and counted.
  - Follow-ups ("shorter excerpt") revise in place. **Save draft** creates the entry, or saves draft changes on an existing one; it never publishes. Then **Open in editor**.
  - The session id is in the URL, so a reload resumes the conversation.
- **Editor sidebar → AI writer**: opens the writer on that saved entry, optionally with what should change, and starts right away. EmDash disables Block Kit editor panels for plugins with a React admin entry, so there's no in-editor patch preview anymore.
- **AI runs**: one row per writer turn (model, tokens, time, brief or error).

How it's wired:
- **`WriterAgent`** (`src/agent/writer-agent.ts`, `AIChatAgent` from `@cloudflare/ai-chat`) runs `streamText` on Workers AI (`workers-ai-provider`) with tools.
  - Server tools: `get_entry_spec`, `get_profile`, `fetch_url` (public http(s) only, ~40 KB), `set_field` (validates through `src/field-values.ts` and updates the synced state), `suggest_tags`, `validate_entry`.
  - Client tools, answered by the page: `search_content` (the plugin's `search` route) and `ask_user` (the question card).
  - The DO has **no CMS access**. The page loads everything CMS-derived through the plugin's private routes (`session`, `search`, `save`, `runs`) under your admin session and sends it as the chat `body`.
- `src/worker.ts` routes `/agents/writer-agent/<session>` through `routeWriterAgent`, before EmDash. It requires an HMAC token that the `session` route mints for that session (`AI_WRITER_SECRET`; `astro dev` falls back to a fixed dev secret).
- `src/entry-spec.ts` decides the writable fields from the live schema: prose types only, plus the `WRITABLE_FIELDS` allow-list and a `PURPOSE` hint per field. A new prose field needs adding to both. Blocks are validated against the seed's `blockTypes` (`src/blocks.ts`; figure/gallery are excluded).
- Settings (Plugins → AI writer): model (it must support tool calling; `src/models.ts`), style guide (the system prompt), max tokens per step.

Config and ops:
- `wrangler.jsonc`: the `AI` binding, and a `WriterAgent` Durable Object binding (both also in `previews`), plus `migrations` tag `v1` (`new_sqlite_classes: ["WriterAgent"]`). Renaming or removing the class needs a new migration tag.
- **Secret:** `wrangler secret put AI_WRITER_SECRET` for prod, and the same for previews. Without it the writer page says so and refuses to start.
- **Dev:** Workers AI only runs remotely, behind the Access-protected workers.dev proxy, so remote bindings are opt-in.
  - `pnpm dev`: no AI.
  - `pnpm dev:ai`: real model (Access login, or `CLOUDFLARE_ACCESS_CLIENT_ID`/`_SECRET`).
  - `AI_WRITER_MOCK=1` in `.dev.vars`: a scripted mock model (`src/agent/mock-model.ts`). It walks the whole flow (tools, a question, every field, tags, validate) under plain `pnpm dev`, for UI work without costs.
- The admin page ships its own CSS (`src/admin/styles.ts`, on Kumo theme variables), because the admin's Tailwind doesn't scan plugin sources.

## What not to do

- Don't add a second accent colour or coloured section backgrounds. The purple accent, its soft tint and the fixed-dark player card are the whole palette.
- Don't use drop shadows on cards. Shadows exist only on floating layers (menu dropdown, palette).
- Don't hardcode copy that belongs in the `profile` entry or a collection. The site is meant to be fully CMS-driven.
- Don't write generic copy ("Welcome to my blog"). Keep it specific and dry, in the terminal/git voice.
- Don't add JS frameworks for interactivity. The header, palette, filters and player are small vanilla scripts.
