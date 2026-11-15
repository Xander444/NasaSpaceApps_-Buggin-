# Team handoff

## Simulator / risk track

Owner focus: PyTorch engine, scenario model, calibration, validation, hotspot ranking, uncertainty, and 3D output contract.

Current milestone: a reproducible Monte Carlo spatial screener that accepts a human-confirmed object map and processes one million candidate locations in bounded batches.

The first-release UI imports GLB / self-contained glTF, suggests roles from mesh names, requires every mesh to be confirmed or ignored, hashes the source model, and submits the reviewed scenario to the local FastAPI service. Read `docs/ANNOTATION_CONTRACT.md` before changing this gate.

Next work:

1. Map BASS-II test conditions to material/flow calibration experiments.
2. Add direction-aware transport, oxygen depletion, material consumption, and time steps.
3. Add scenario comparison and sensitivity analysis.
4. Validate that rankings remain stable across seeds and grid resolutions.
5. Define out-of-evidence-range warnings.
6. Build and evaluate a labeled recognition dataset before presenting any learned recognizer as AI.

## Data / study track

Owner focus: official NASA sources, PSI ingestion, normalization, source attribution, unit reconciliation, and human verification.

Start with:

```bash
python analysis/import_psi.py
```

Then review `data/psi/manifest.json` and the normalized BASS-II rows. Follow `docs/DATA_CONTRACT.md`.

## Frontend / comparison track

Owner focus: goals, scenario input, study search, comparison, responsive UI, and the polished 3D experience.

The current interface is a deliberately controlled first release. Follow `docs/FRONTEND_CONTRACT.md` and `docs/THEME_GUIDE.md`; preserve the human-confirmation gate and do not hard-code evidence values into React components. The root route is the project description, the explorer is at `/evidence`, the screener is at `/simulator`, and the public team page is at `/about`.

## Integration rule

Changes to any JSON contract require a `schema_version` update or a backward-compatible addition. Scientific values and presentation code must remain separate.

## Evidence search and comparison delivery

The explorer now has an offline index builder, BM25/structured search, cited test comparison and exports, related-data modes, and an optional real pretrained semantic service. Start with [SEARCH.md](SEARCH.md), run `npm run test:search` and the analysis Python tests, and inspect `docs/search-evaluation.json`. The static path is the default.

## Upstream integration

Both normal/inverse tables are retained for PSI-10/159; blank rows are excluded from the rebuilt index. The search engine retains program-family filtering and uses a compressed static index. See `SEARCH.md` for current counts and evaluation.
