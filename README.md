# Flame in Freefall

An evidence-first dashboard and human-confirmed 3D fire-risk screening prototype for the 2026 NASA Space Apps Challenge. It searches imported NASA Physical Sciences Informatics evidence, preserves provenance and unknown conditions, and optionally adds pretrained semantic retrieval. A separate PyTorch workflow screens candidate spatial hotspots.

## Run the website locally

```bash
npm install
npm run dev
npm run build
```

The project overview opens at `/`. The evidence explorer at `/evidence` works from the committed search index without Python, a server, an API key, or live NASA access. Search a question, add optional required/preferred conditions, inspect cited rows, compare up to three selections, and export verified tests. Try **Design a smoke detector**, or **PMMA** with required initial oxygen **22.2% vol**.

The other public routes are `/simulator` for cabin screening, `/sources` for the primary-source register, and `/about` for the team page. The visual and language rules for future frontend work are in [THEME_GUIDE.md](docs/THEME_GUIDE.md).

```bash
npm run search:index       # explicit, offline preprocessing
npm run test:search
npm run search:evaluate
```

[Search setup, provenance, ranking, optional semantic service, evaluation, and limitations](docs/SEARCH.md) are documented in detail. Optional semantic search uses a real pinned Sentence Transformers/PyTorch model with a visible keyword fallback. It is disabled until configured; it does not affect static builds.

## Run the existing 3D workflow

The controlled annotation/screening workflow remains at `/simulator`. To run its simulations, install its Python dependencies and start the existing API in a separate terminal:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
npm run api
```

Run `npm run dev` in another terminal. Production frontend output is written to `dist/`; no publishing is part of these commands.

## Verify the integrated project

After activating `.venv` and installing `requirements.txt`, run `npm run check` to check search, analysis, simulator behavior, and the production build together. Optional semantic setup is documented in [SEARCH.md](docs/SEARCH.md). Rebuild the search index explicitly with `npm run search:index` whenever committed source data changes; restart the semantic service afterward so versions agree.

## First-release 3D workflow

1. Use the built-in synthetic compartment or import a segmented `.glb` / self-contained `.gltf` model.
2. Click every mesh. The baseline recognizer suggests a role from the object name, but never confirms it.
3. Correct and confirm the role, or explicitly ignore the object. Any edit invalidates its prior confirmation.
4. Enter cabin oxygen and pressure, then confirm the model uses metres.
5. Run 100,000 sampled locations through the local PyTorch service and inspect ranked candidate hotspots. This default was selected from the included multi-seed CPU benchmark, rather than chosen arbitrarily.

For the fastest judge path, click **View precomputed result**. It loads the exact committed `cabin-demo.glb` fixture and a repeatable result without bypassing the review and metre-unit gates for new simulations.

The source model stays in the browser. The API receives derived geometry bounds, reviewed labels, a SHA-256 model hash, and the environment—not the CAD file. See `docs/ANNOTATION_CONTRACT.md`.

## Import NASA PSI data

```bash
npm run import:psi
```

The importer currently covers 24 relevant NASA PSI investigations spanning BASS/BASS-II, Saffire I–III, SAME/SAME-R, FLEX/FLEX-2, CFI, SPICE, SLICE, ACME, DAFT, and related modeling work. It indexes 16,354 public files, downloads 22 official experimental tables, and preserves 2,870 raw table rows (including 861 empty rows) as raw source text. BASS-II has an additional normalized set of 129 test rows. See `data/psi/manifest.json`, `data/source_review.json`, and `docs/DATA_CONTRACT.md`.

The official NASA PSI search returned 26 combustion matches. Two keyword false positives were excluded with reasons recorded in `data/source_review.json`. The Canadian Space Agency open-data catalog was also checked: its combustion search returned MOPITT atmospheric carbon-monoxide data, which is useful for biomass-burning research but not comparable to enclosed-spacecraft microgravity fire experiments, so it is not included in rankings.

Complex source values remain raw text. For example, a fan sequence such as `0.9 0.5 and down` is not silently converted into a single flow measurement.

## Run the 3D screening simulation

```bash
npm run simulate
```

The default scenario samples 100,000 possible locations in bounded PyTorch batches. It aggregates them into a 3D voxel field, ranks candidate hotspots, and reports detector and suppression coverage at each hotspot. Results are written to `public/simulation/demo.json`.

Each hotspot now includes its location, nearby reviewed objects, mean scoring terms, and same-sample counterfactual contributor deltas calculated by the scoring engine itself. The deltas are deliberately shown as non-additive because the screening formula is multiplicative. Results also separate user-entered cabin conditions from illustrative coefficients, state which fields have no score effect, and record scenario, ignition-input, and sample-location hashes.

The exact cabin fixture has two additional reproducibility artifacts:

- `public/simulation/benchmark.json` records CPU timings and top-region stability across five seeds and four sample counts. In the latest validation run, 100,000 samples had 100% mean/minimum top-10 neighborhood retention, about 0.79 exact top-25 Jaccard overlap, and 0.033-second median model latency on the recorded CPU environment.
- `public/simulation/cabin-demo.json` contains the precomputed result, a same-location detector-move comparison, and a fabric/vent research probe that hands off a NASA PSI forced-airflow query while preserving airflow speed as unknown.

Regenerate both artifacts with:

```bash
python simulator/benchmark.py
python simulator/build_cabin_release.py
```

The current score is a **relative screening index**, not a fire probability, flame-spread simulation, CFD solution, engineering certification, or mission-safety recommendation. The included spacecraft layout and material coefficients are synthetic demonstration assumptions. See `simulator/README.md` and `simulator/scenario.schema.json`.

The software-validation procedure, exact fixture fingerprint, stability results, controlled detector comparison, maximum-request smoke test, and remaining scientific-validation gap are recorded in [`docs/SIMULATION_VALIDATION.md`](docs/SIMULATION_VALIDATION.md).

## PyTorch analysis

The legacy analysis command performs investigation-level similarity over sourced PSI metadata; it is separate from the new query retrieval engine. It is an exploratory retrieval aid—not a trained fire-risk model.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python analysis/analyze.py
python -m unittest discover -s analysis -p 'test_*.py'
```

The analysis writes `public/analysis.json`, which contains the three nearest evidence records for each investigation and the shared fields responsible for each match. Numeric values are only included where the linked source reports them. Missing numeric fields receive a separate zero-valued observability mask; they are never interpreted as measured zeroes.

## Data and AI contract

- Search summaries are cited extracts from imported catalog sections and table cells. Hypotheses and prospective impacts retain their labels.
- Earlier curator copy is archived separately and is not presented as AI-generated findings.
- No absent measurement is converted to zero or inferred.
- Search and comparison expose source IDs, excerpts, row locators, units, and discrepancies.
- The optional semantic service encodes questions and evidence with a pinned pretrained model. Retrieval similarity is not scientific confidence or fire prediction.
- The 3D recognition suggestion is currently a deterministic name heuristic, not a trained AI model. This is stated in the UI and every label requires human confirmation.
- Gravity and temperature are recorded but do not affect the current score. Directional transport, oxygen depletion, material consumption, and time evolution are not implemented.

## Team handoff

Start with `docs/TEAM_HANDOFF.md` and `docs/THEME_GUIDE.md`. Data, frontend, study-comparison, and 3D model-preparation task templates are in `templates/`. The public “Who we are” page intentionally contains labeled sample copy that must be replaced before submission.

## Next architecture slice

Calibrate simulator inputs against verified test-level evidence, design a labeled recognition evaluation set, add directed/time-dependent transport, implement sensitivity analysis, and validate rankings against held-out investigations. Split any learned model by investigation—not random row—to prevent data leakage.
