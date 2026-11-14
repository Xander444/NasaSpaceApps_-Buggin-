# 3D Fire-Risk Screening Engine

This module samples millions of possible ignition locations inside a 3D compartment, scores each location in batches with PyTorch, aggregates results into a voxel grid, and ranks candidate hotspots.

It is **not** computational fluid dynamics, a flame-chemistry solver, or a certified probability-of-fire model. The score is a relative screening index intended to prioritize locations for deeper analysis.

## Run

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
- nearby ventilation influence;
- detector coverage gaps;
- suppression coverage gaps; and
- proximity to consequence zones such as egress or crew areas.

The raw score is transformed to a bounded 0–100 index with `100 × (1 − exp(−raw))`. It is not a percentage probability. Every coefficient in the demo scenario is labelled as an illustrative assumption.

## Extension path

1. Replace illustrative material coefficients with versioned calibration outputs derived from test-level NASA evidence.
2. Add directed transport and time steps.
3. Add oxygen depletion and material consumption.
4. Compare predictions against held-out experiments.
5. Use validated CFD for high-consequence engineering decisions.
