The writer calls Cloudflare's AI API with your own Cloudflare account. It needs three things:

1. **An API token.** In the Cloudflare dashboard, go to **My Profile → API Tokens → Create Token**, start from a custom token, and give it the **Account → Workers AI → Read** permission for your account.
2. **Your account ID.** The 32-character id in the dashboard URL.
3. **A gateway.** Most accounts have one called `default` under **AI → AI Gateway**. Requests run through it, with logs and spend limits.

Open **AI writer → Settings** in the EmDash admin, enter the account ID and token, pick a model, and press **Test connection**.

### Models and billing

- **Workers AI models** (`@cf/…`, the default) are billed as Workers AI usage on your account. No extra setup.
- **Other models** (Claude, GPT, Gemini, …) go through AI Gateway unified billing. Buy credits under **AI → AI Gateway → Credits** first; without credits the writer says so.

A plugin request may run for at most 30 seconds, so a whole entry has to be written in about 24. Fast models fit; slow reasoning models may not. When one times out, pick a faster model, lower **Max output tokens**, or write one field at a time from the editor panel.

### What it writes

Text, long-text and rich-text fields, plus the SEO description when the collection has SEO enabled. It skips fields whose name marks an identifier (`url`, `email`, `sku`, `version`, …) and anything you list under **Fields to skip**. Dates, images, links and tags stay yours; it suggests existing tags but never assigns them.

New entries are created as drafts. The editor panel saves draft changes on collections with revisions, and only works on drafts in collections without them. It never publishes.

### Facts

Put what the writer may say about you and the site under **About you and the site**. It never invents names, numbers, dates or links: anything the brief doesn't give it becomes a visible `[TODO: …]` marker.
