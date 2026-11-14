# Flame in Freefall

An evidence-first dashboard prototype for the 2026 NASA Space Apps Challenge. It indexes investigation-level NASA Physical Sciences Informatics records and makes missing metadata explicit rather than estimating it.

## Run locally

```bash
npm install
npm run dev
```

Open the local address printed by Vite. For a production check, run `npm run build`; the static output is written to `dist/` and can be deployed to GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

## PyTorch analysis

The first analysis layer performs explainable, missing-aware similarity analysis over sourced PSI investigation metadata. It is an exploratory retrieval aid—not a trained fire-risk model.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python analysis/analyze.py
python -m unittest discover -s analysis -p 'test_*.py'
```

The analysis writes `public/analysis.json`, which contains the three nearest evidence records for each investigation and the shared fields responsible for each match. Numeric values are only included where the linked source reports them. Missing numeric fields receive a separate zero-valued observability mask; they are never interpreted as measured zeroes.

## Data and AI contract

- Current records are hand-curated from linked NASA PSI and NASA overview pages.
- “AI-grounded interpretation” is deterministic prototype copy tied to each record, not a model call.
- No absent measurement is converted to zero or inferred.
- A future retrieval layer should emit source IDs and excerpts for every generated statement and refuse unsupported quantitative claims.
- PyTorch currently supports metadata encoding and similarity retrieval. Training is intentionally deferred until test-level records and defensible labels exist.

## Next architecture slice

Add a NASA PSI ingestion job, normalize test-level metadata, store source snapshots, and introduce a retrieval service that returns claim-level citations and uncertainty labels. Once enough test-level examples exist, split by investigation—not random row—to prevent data leakage during model evaluation.
