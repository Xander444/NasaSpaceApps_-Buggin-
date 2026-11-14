# Flame in Freefall

An evidence-first dashboard and human-confirmed 3D fire-risk screening prototype for the 2026 NASA Space Apps Challenge. It imports public NASA Physical Sciences Informatics records, preserves source provenance and missing data, and uses PyTorch to rank study similarity and candidate spatial hotspots.

## Run locally

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm install
```

Start the two local services in separate terminals. Activate `.venv` in the API terminal first.

```bash
npm run api
```

```bash
npm run dev
```

Open the local address printed by Vite. For a production check, run `npm run build`; the static output is written to `dist/` and can be deployed to GitHub Pages, Netlify, Vercel, or Cloudflare Pages.

The study explorer is at `/`; the controlled 3D annotation and screening workflow is at `/simulator`.

## First-release 3D workflow

1. Use the built-in synthetic compartment or import a segmented `.glb` / self-contained `.gltf` model.
2. Click every mesh. The baseline recognizer suggests a role from the object name, but never confirms it.
3. Correct and confirm the role, or explicitly ignore the object. Any edit invalidates its prior confirmation.
4. Enter cabin oxygen and pressure, then confirm the model uses metres.
5. Run one million sampled locations through the local PyTorch service and inspect ranked candidate hotspots.

The source model stays in the browser. The API receives derived geometry bounds, reviewed labels, a SHA-256 model hash, and the environment—not the CAD file. See `docs/ANNOTATION_CONTRACT.md`.

## Import NASA PSI data

```bash
npm run import:psi
```

The importer currently covers 24 relevant NASA PSI investigations spanning BASS/BASS-II, Saffire I–III, SAME/SAME-R, FLEX/FLEX-2, CFI, SPICE, SLICE, ACME, DAFT, and related modeling work. It indexes 16,354 public files, downloads 22 official experimental tables, and preserves 2,484 experimental rows as raw source text. BASS-II has an additional normalized set of 129 test rows. See `data/psi/manifest.json`, `data/source_review.json`, and `docs/DATA_CONTRACT.md`.

The official NASA PSI search returned 26 combustion matches. Two keyword false positives were excluded with reasons recorded in `data/source_review.json`. The Canadian Space Agency open-data catalog was also checked: its combustion search returned MOPITT atmospheric carbon-monoxide data, which is useful for biomass-burning research but not comparable to enclosed-spacecraft microgravity fire experiments, so it is not included in rankings.

Complex source values remain raw text. For example, a fan sequence such as `0.9 0.5 and down` is not silently converted into a single flow measurement.

## Run the 3D screening simulation

```bash
npm run simulate
```

The default scenario samples one million possible ignition locations in bounded PyTorch batches. It aggregates them into a 3D voxel field, ranks candidate hotspots, and reports detector and suppression coverage at each hotspot. Results are written to `public/simulation/demo.json`.

The current score is a **relative screening index**, not a fire probability, flame-spread simulation, CFD solution, engineering certification, or mission-safety recommendation. The included spacecraft layout and material coefficients are synthetic demonstration assumptions. See `simulator/README.md` and `simulator/scenario.schema.json`.

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
- The 3D recognition suggestion is currently a deterministic name heuristic, not a trained AI model. This is stated in the UI and every label requires human confirmation.
- Gravity and temperature are recorded but do not affect the current score. Directional transport, oxygen depletion, material consumption, and time evolution are not implemented.

## Team handoff

Start with `docs/TEAM_HANDOFF.md`. Data, frontend, study-comparison, and 3D model-preparation task templates are in `templates/`.

## Next architecture slice

Calibrate simulator inputs against verified test-level evidence, design a labeled recognition evaluation set, add directed/time-dependent transport, implement sensitivity analysis, and validate rankings against held-out investigations. Split any learned model by investigation—not random row—to prevent data leakage.
