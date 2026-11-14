# Flame in Freefall

An evidence-first dashboard prototype for the 2026 NASA Space Apps Challenge. It indexes investigation-level NASA Physical Sciences Informatics records and makes missing metadata explicit rather than estimating it.

## Run locally

```bash
npm install
npm run dev
```

Open the local address printed by Vite. For a production check, run `npm run build`; the static output is written to `dist/` and can be deployed to GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

## Data and AI contract

- Current records are hand-curated from linked NASA PSI and NASA overview pages.
- “AI-grounded interpretation” is deterministic prototype copy tied to each record, not a model call.
- No absent measurement is converted to zero or inferred.
- A future retrieval layer should emit source IDs and excerpts for every generated statement and refuse unsupported quantitative claims.

## Next architecture slice

Add a NASA PSI ingestion job, normalize test-level metadata, store source snapshots, and introduce a retrieval service that returns claim-level citations and uncertainty labels.
