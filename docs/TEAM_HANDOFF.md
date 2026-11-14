# Team handoff

## Simulator / risk track

Owner focus: PyTorch engine, scenario model, calibration, validation, hotspot ranking, uncertainty, and 3D output contract.

Current milestone: a reproducible Monte Carlo spatial screener that can process one million ignition locations in bounded batches.

Next work:

1. Map BASS-II test conditions to material/flow calibration experiments.
2. Add direction-aware transport and time steps.
3. Add scenario comparison and sensitivity analysis.
4. Validate that rankings remain stable across seeds and grid resolutions.
5. Define out-of-evidence-range warnings.

## Data / study track

Owner focus: official NASA sources, PSI ingestion, normalization, source attribution, unit reconciliation, and human verification.

Start with:

```bash
python analysis/import_psi.py
```

Then review `data/psi/manifest.json` and the normalized BASS-II rows. Follow `docs/DATA_CONTRACT.md`.

## Frontend / comparison track

Owner focus: goals, scenario input, study search, comparison, responsive UI, and the polished 3D experience.

The current viewer is intentionally minimal. Follow `docs/FRONTEND_CONTRACT.md`; do not hard-code simulator values into React components.

## Integration rule

Changes to any JSON contract require a `schema_version` update or a backward-compatible addition. Scientific values and presentation code must remain separate.
