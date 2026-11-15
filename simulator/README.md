# 3D Spatial Screening Engine

This module samples millions of possible locations inside a human-reviewed 3D compartment map, scores each location in batches with PyTorch, aggregates results into a voxel grid, and ranks candidate hotspots.

It is **not** computational fluid dynamics, a flame-chemistry solver, or a certified probability-of-fire model. The score is a relative screening index intended to prioritize locations for deeper analysis.

## Run from the browser

Install the root requirements, activate the virtual environment, and start the API:

```bash
source .venv/bin/activate
npm run api
```

In another terminal, run `npm run dev`, open `/simulator`, review every mesh, confirm metre units, and submit the scenario. The API accepts 1,000 to 2,000,000 samples and the interface uses the benchmark-selected 100,000-sample default.

Click **View precomputed result** to inspect the exact shipped `public/models/cabin-demo.glb` fixture immediately. Editing that map returns to the normal unreviewed state; it does not reuse fixture confirmations for a changed scenario.

## Run the CLI directly

```bash
python simulator/engine.py --samples 100000
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

The raw score is transformed to a bounded 0–100 index with `100 × (1 − exp(−raw))`. It is not a percentage probability. Every coefficient in the demo scenario is labelled as an illustrative assumption. The API rejects incomplete object-review manifests, unconfirmed model units, scored objects that do not match their confirmed roles, duplicate roles, and non-finite or out-of-compartment geometry.

For every ranked hotspot, the engine aggregates the actual formula terms and computes contributor deltas by rescoring the same sample points with one term neutralized. These counterfactual deltas explain direction and strength but do not sum to the index because the terms interact multiplicatively. Gravity, ambient temperature, and smoke yield are retained in the result and explicitly marked as having no current score effect.

Each selected spot also creates research handoffs for detector response and suppression; material-and-vent overlap adds a flammability handoff. The explorer link carries the spot, user-entered cabin conditions, and the relevant confirmed objects. A vent location never becomes an airflow-speed condition unless the scenario supplies a finite physical speed.

## Repeatability and controlled comparison

```bash
python simulator/benchmark.py
python simulator/build_cabin_release.py
```

The benchmark runs the exact cabin fixture across seeds 2026–2030 at 50k, 100k, 250k, and 500k samples. It measures both exact top-25 overlap and whether the same one-voxel neighborhoods remain near the top. The release builder verifies the exact GLB file hash, then moves one detector to the leading baseline hotspot and reruns the same seed, batch size, dimensions, and sample count. It verifies that only the detector position changed and that sample-location and ignition-input hashes remain identical before reporting the coverage and relative-index changes at that exact baseline voxel.

## First-release limits

- The result is a static spatial screen, not flame shape, fire spread over time, CFD, or chemistry.
- Gravity and ambient temperature are retained as scenario metadata but do not affect the score.
- Vent direction is recorded but the current ventilation term is radial.
- Local oxygen enrichment is radial and bounded; it is not a leak or gas-dispersion model.
- Material presets are uncalibrated assumptions and require validated calibration data before engineering use.
- The browser accepts GLB and self-contained glTF only. Models must be split into meaningful meshes.
- Nested transforms and model scale are honored in world space. The overlay and scorer share normalized world coordinates, but scoring uses world-axis-aligned boxes; a large rotated mesh can over-approximate occupied space.

## Public backend

The static site can point to a separately deployed API through `VITE_SIMULATOR_API_URL`. The API applies an explicit browser-origin allowlist and a bounded concurrency guard. The exact precomputed cabin is fetched from the static site and remains available when the API is offline. See `docs/BACKEND_DEPLOYMENT.md` for the container and deployment contract.

## Extension path

1. Replace illustrative material coefficients with versioned calibration outputs derived from test-level NASA evidence.
2. Add directed transport, oxygen depletion, material consumption, and time steps.
3. Compare model behavior against held-out experiments.
4. Use validated CFD for high-consequence engineering decisions.
