# AI Writer Lite

An EmDash plugin that writes drafts from a brief with any model Cloudflare serves. It is the
registry edition of this site's `plugins/ai-writer`: sandboxed, installable from the EmDash plugin
registry, and generic, so it works on any site's collections.

- **New with AI** (admin page): pick a collection, write a brief, press **Write draft**. Every
  text field is filled and the entry is created as a draft.
- **AI writer** (editor panel on every saved entry): fills the empty fields, or rewrites one, and
  saves the result as draft changes.
- **AI runs**: the last 50 runs with model, tokens, time and errors.
- **Settings**: Cloudflare account ID, API token, gateway, model, facts about you and the site,
  style guide, fields to skip, and a **Test connection** button.

It never publishes, never assigns tags (it suggests existing ones), and never invents facts:
whatever the brief doesn't say becomes a visible `[TODO: …]` marker.

Setup for site owners is in [docs/setup.md](docs/setup.md); the registry listing shows the same text.

## How it works

The sandbox has no `AI` binding, so every model call goes over HTTPS to Cloudflare's
`/ai/v1/chat/completions` endpoint with the site's own API token (`allowedHosts:
["api.cloudflare.com"]`). `@cf/…` models run on Workers AI; `provider/model` ids go through AI
Gateway unified billing.

One model call writes a whole entry. The answer comes back as `=== field: slug ===` sections, so a
long Markdown body never needs JSON escaping. Markdown becomes Portable Text in the shapes EmDash's
built-in renderer knows (headings, lists, code, tables, quotes).

Which fields it writes comes from the live schema (`src/fields.ts`): string, text and Portable Text
fields, minus anything whose slug marks an identifier (`url`, `email`, `sku`, `version`, …),
fields with a custom widget or a validation pattern, non-translatable fields, and the site's
"Fields to skip". Common names (`excerpt`, `subtitle`, `caption`, …) get a purpose hint.

## Sandbox limits it is built around

- **30 seconds per request.** The model call gets a 24-second gateway timeout
  (`cf-aig-request-timeout`), so a slow model fails with a readable error instead of the sandbox
  killing the request. The settings page recommends fast models.
- **10 calls out per request.** Settings are stored as one object plus the encrypted token, so
  reading them is one call. The heaviest request (the panel filling an entry that has a pending
  draft and tags) makes 9. The local test host doesn't enforce this limit, so it's kept by design,
  not by a test.
- **No SEO fields.** EmDash 1.3's sandbox bridge passes updates straight to the content table, which
  has no `seo` column, so the writer leaves `seo.description` alone.
- **No blocks fields.** Block type definitions aren't readable from the sandbox.
- **Editor panel without preview.** A panel that proposes unsaved changes must list its
  collections in the manifest, which a generic plugin can't. So the panel writes draft changes and
  reloads the editor. On collections without revisions it only touches drafts, since an update
  there changes the entry itself.
- **Secrets need `EMDASH_ENCRYPTION_KEY`.** EmDash only stores the API token encrypted; the
  settings page says how to add the key when a site lacks it.

## Develop

```sh
pnpm install            # from the repo root
pnpm run validate       # manifest
pnpm run typecheck
pnpm run test           # unit tests + end-to-end through the real sandbox (Worker Loader + PluginBridge)
pnpm run bundle         # dist/ai-writer-lite-<version>.tar.gz
```

The end-to-end tests (`tests/plugin.test.ts`) run the built plugin through EmDash's production
sandbox runner with Cloudflare's API mocked: settings, New with AI, the editor panel on new,
published and draft entries, and error handling.

## Publish

1. Set `publisher` in `emdash-plugin.jsonc` to your Atmosphere account's DID (it's a placeholder
   now; publishing refuses to run with a mismatch).
2. `pnpm run login -- <your-handle>`, then `pnpm run publish`.
3. Follow the listing checks with the `emdash-plugin info … --watch` command it prints.

Bump `version` in `package.json` for every release, and a major version whenever `capabilities`,
`allowedHosts` or `storage` change: installed sites consented to the old ones.
