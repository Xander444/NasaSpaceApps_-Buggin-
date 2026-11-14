# 3D Fire-Risk Screening Engine

This module samples millions of possible locations inside a human-reviewed 3D compartment map, scores each location in batches with PyTorch, aggregates results into a voxel grid, and ranks candidate hotspots.

It is **not** computational fluid dynamics, a flame-chemistry solver, or a certified probability-of-fire model. The score is a relative screening index intended to prioritize locations for deeper analysis.

## Run from the browser

Install the root requirements, activate the virtual environment, and start the API:

```bash
source .venv/bin/activate
npm run api
```

In another terminal, run `npm run dev`, open `/simulator`, review every mesh, confirm metre units, and submit the scenario. The API accepts 1,000 to 2,000,000 samples and the interface uses 1,000,000.

## Run the CLI directly

```bash
python simulator/engine.py --samples 1000000
```

The default result is written to `public/simulation/demo.json`. Use fewer samples while editing:

```bash
python simulator/engine.py --samples 100000 --batch-size 25000
```

## Current score

For every sampled point, the engine combines:

- proximity to assumed ignition sources;
- nearby material ignition susceptibility and spread potential;
- oxygen and pressure modifiers;
- optional radial local-oxygen enrichment assumptions;
- nearby ventilation influence;
- detector coverage gaps;
- suppression coverage gaps; and
- proximity to consequence zones such as egress or crew areas.

The raw score is transformed to a bounded 0–100 index with `100 × (1 − exp(−raw))`. It is not a percentage probability. Every coefficient in the demo scenario is labelled as an illustrative assumption. The API also rejects incomplete object-review manifests and unconfirmed model units.

## First-release limits

- The result is a static spatial screen, not flame shape, fire spread over time, CFD, or chemistry.
- Gravity and ambient temperature are retained as scenario metadata but do not affect the score.
- Vent direction is recorded but the current ventilation term is radial.
- Local oxygen enrichment is radial and bounded; it is not a leak or gas-dispersion model.
- Material presets are uncalibrated assumptions and require validated calibration data before engineering use.
- The browser accepts GLB and self-contained glTF only. Models must be split into meaningful meshes.

## Extension path

1. Replace illustrative material coefficients with versioned calibration outputs derived from test-level NASA evidence.
2. Add directed transport, oxygen depletion, material consumption, and time steps.
3. Add oxygen depletion and material consumption.
4. Compare predictions against held-out experiments.
5. Use validated CFD for high-consequence engineering decisions.
