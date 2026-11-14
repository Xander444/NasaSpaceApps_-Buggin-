# Flame in Freefall

An evidence-first dashboard and 3D spatial fire-risk screening prototype for the 2026 NASA Space Apps Challenge. It imports public NASA Physical Sciences Informatics records, preserves source provenance and missing data, and uses PyTorch to rank study similarity and candidate spatial hotspots.

## Run locally

```bash
npm install
npm run dev
```

Open the local address printed by Vite. For a production check, run `npm run build`; the static output is written to `dist/` and can be deployed to GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

The study explorer is at `/`; the intentionally minimal 3D viewer is at `/simulator`.

## Import NASA PSI data

```bash
npm run import:psi
```

The importer currently covers BASS/BASS-II, FLEX, Saffire I–III, SAME/SAME-R, and a BASS modeling investigation. It indexes 1,511 public files, downloads eight official experimental tables, and preserves 663 experimental rows as raw source text. BASS-II has an additional normalized set of 129 test rows. See `data/psi/manifest.json` and `docs/DATA_CONTRACT.md`.

Complex source values remain raw text. For example, a fan sequence such as `0.9 0.5 and down` is not silently converted into a single flow measurement.

## Run the 3D screening simulation

```bash
npm run simulate
```

The default scenario samples one million possible ignition locations in bounded PyTorch batches. It aggregates them into a 3D voxel field, ranks candidate hotspots, and reports detector and suppression coverage at each hotspot. Results are written to `public/simulation/demo.json`.

The current score is a **relative screening index**, not a fire probability, CFD solution, engineering certification, or mission-safety recommendation. The included spacecraft layout and material coefficients are synthetic demonstration assumptions. See `simulator/README.md` and `simulator/scenario.schema.json`.

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

- Investigation summaries are imported from the public NASA PSI API; the initial dashboard descriptions remain curated.
- “AI-grounded interpretation” is deterministic prototype copy tied to each record, not a model call.
- No absent measurement is converted to zero or inferred.
- A future retrieval layer should emit source IDs and excerpts for every generated statement and refuse unsupported quantitative claims.
- PyTorch currently supports metadata encoding and similarity retrieval. Training is intentionally deferred until test-level records and defensible labels exist.

## Team handoff

Start with `docs/TEAM_HANDOFF.md`. Data, frontend, and study-comparison task templates are in `templates/`.

## Next architecture slice

Calibrate simulator inputs against verified test-level evidence, add directed/time-dependent transport, implement sensitivity analysis, and validate rankings against held-out investigations. Split any learned model by investigation—not random row—to prevent data leakage.
