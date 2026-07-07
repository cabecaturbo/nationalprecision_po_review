# National Precision Bearing — PO Review Desk

Internal contract-review tool for inbound bearing purchase orders. Two modes:

- **Compare** — original PO vs. revised PO → field-level diff (changed / added / removed).
- **Review** — single PO → review card + AI quality-clause summary (web search enabled).

Next.js (App Router) + TypeScript, deployable to Vercel. The Anthropic API is
called **server-side only** — the key never reaches the browser.

## Architecture

```
Browser (app/page.tsx)
  │  reads PDF → base64, POSTs JSON
  ▼
/app/api/extract   → Anthropic Messages API (PDF document → field JSON)
/app/api/clauses   → Anthropic Messages API + web_search tool (clause summary)
  │  process.env.ANTHROPIC_API_KEY  (server-only)
  ▼
Anthropic API
```

The frontend never calls Anthropic directly. Both routes run on the Node runtime
and read `ANTHROPIC_API_KEY` from the environment.

## File tree

```
nationalprecision_po_review/
├─ app/
│  ├─ api/
│  │  ├─ extract/route.ts     # PDF (base64) → field JSON, server-side
│  │  └─ clauses/route.ts     # quality-clause summary, web search enabled
│  ├─ globals.css             # Tailwind directives
│  ├─ layout.tsx              # root layout + Inter font
│  └─ page.tsx                # the ported UI (client component)
├─ lib/
│  ├─ anthropic.ts            # server-side Anthropic helper + MODEL constant
│  └─ types.ts                # PO shape + response types
├─ npb-po-review-desk.jsx     # original source component (reference only)
├─ .env.example               # env template (copy to .env.local)
├─ .env.local                 # your real key — gitignored, never committed
├─ .gitignore
├─ next.config.mjs
├─ package.json
├─ postcss.config.mjs
├─ tailwind.config.ts
└─ tsconfig.json
```

## Run locally

```bash
npm install
# add your key to .env.local:
#   ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Open http://localhost:3000.

Get an API key at https://console.anthropic.com/.

## Deploy to Vercel

1. Push to GitHub:
   ```bash
   git push -u origin main
   ```
2. In Vercel: **Add New… → Project → Import** this GitHub repo. It autodetects Next.js.
3. Under **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your key (Production + Preview).
4. **Deploy.** Redeploy after changing env vars so they take effect.

## Important notes

- **Model id.** The routes use the model string `claude-sonnet-4-6` as specified.
  ⚠️ That is **not a currently valid Anthropic model id** — live calls will
  return **HTTP 404** until it is changed. To fix, edit the single `MODEL`
  constant in [`lib/anthropic.ts`](lib/anthropic.ts) (e.g. to `claude-sonnet-5`).
  The error surfaces verbatim in the UI, so a 404 here is the tell.

- **Web search billing.** `/api/clauses` enables Anthropic's server-side
  `web_search_20250305` tool. It's billed per use and must be enabled for your
  API key's organization.

- **Upload size / Vercel body limit.** The UI reads the PDF to base64 and POSTs
  it as JSON. base64 inflates ~33%, so an 8 MB file → ~10.7 MB request body.
  Vercel serverless functions cap the request body at **4.5 MB**, so the largest
  allowed files will fail on Vercel with a 413 even though they pass the client
  guard. For big PDFs, move to a direct-to-storage upload (e.g. Supabase Storage
  / S3 signed URL) and pass a reference instead of the bytes. The 8 MB client
  guard is intentional and unchanged.

- **Persistence (v1: none).** No database yet. The code is structured so saved
  review history can be added later via Supabase — see the
  `// TODO: persist review here` markers in [`app/page.tsx`](app/page.tsx).
