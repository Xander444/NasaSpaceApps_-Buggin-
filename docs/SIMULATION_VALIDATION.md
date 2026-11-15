# Simulation validation record

Validation date: 2026-11-15

This record covers software correctness, repeatability, controlled behavior, and performance for the first-release spatial screening model. It is **not scientific validation of fire prediction**. The current coefficients remain illustrative and the model does not solve flame chemistry, CFD, heat transfer, oxygen depletion, material consumption, or time evolution.

## Validated fixture

- Model: `public/models/cabin-demo.glb`
- SHA-256: `335206796c175bf3791b8ca0b76a3208462cb2268b5af32d601ccab43a29ac1a`
- Scenario: `simulator/cabin_demo_scenario.json`
- Scenario SHA-256: `d2048d984d1ead6e14912218b06af334202579e820b098b180ad085bccbd6d7b`
- Ignition-input SHA-256: `f01bfa6514b702a171750b925c660f59fcdb0e5e1e3df3c37420c9504f619a4e`
- Default sample-location SHA-256: `b3f3f751b7e7ef2b70e1a8d226fb3b6cd83d823090de6946ada710847fb381d9`

The release builder now computes the GLB hash directly and refuses to create a release result when it differs from the reviewed scenario.

## Validation environment

- Device: CPU
- Processor reported by Python: `arm`
- Python: `3.13.15`
- PyTorch: `2.15.0`
- Seeds: 2026, 2027, 2028, 2029, 2030

Timings vary by machine. They are included to justify the default on this environment, not as a universal performance guarantee. Benchmark latency excludes Python and PyTorch startup.

## Stability and latency

| Samples | Median model latency | Maximum latency | Mean top-10 region retention | Minimum pair retention | Mean exact top-25 Jaccard |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 50,000 | 0.0257 s | 0.0474 s | 95.5% | 85% | 68.16% |
| 100,000 | 0.0332 s | 0.0620 s | 100% | 100% | 79.47% |
| 250,000 | 0.0638 s | 0.0983 s | 100% | 100% | 82.54% |
| 500,000 | 0.1166 s | 0.1632 s | 100% | 100% | 83.30% |

The retained default is **100,000 samples**. It is the smallest tested count that passes every predefined rule: mean top-10 neighborhood retention at least 80%, minimum pair retention at least 60%, mean exact top-25 Jaccard at least 75%, and median model latency below five seconds.

Top-10 region retention treats the same voxel or an immediate one-voxel Chebyshev neighbor as the same region. Exact hotspot order can change between seeds even when the same physical regions remain near the top.

## High-sample smoke test

The maximum API sample count of 2,000,000 completed on CPU in 3.30 seconds of wall time, including interpreter and library startup. Compared with the 100,000-sample release result:

- top-10 neighborhood retention was 100%;
- exact top-25 Jaccard overlap was 92.31%;
- the mean relative screening index was 1.7892 versus 1.7981 at 100,000 samples; and
- the peak voxel relative screening index was 27.8012 versus 27.9826 at 100,000 samples.

The leading voxel changed order, but the leading regions remained present. The UI and documentation therefore describe ranked **candidate regions**, not a uniquely optimal point.

## Controlled detector comparison

The release builder copied the same scenario and changed only the selected detector position:

| Field | Before | After | Change |
| --- | ---: | ---: | ---: |
| Detector position | `[3.0, 2.2, 0.08] m` | `[5.7, 0.3, 0.1] m` | position only |
| Modeled detection coverage | 0.2062 | 0.7991 | +0.5929 |
| Relative screening index | 27.9826 | 18.7561 | -9.2265 |

The comparison verifies all three conditions in the generated result:

- identical sample-location SHA-256;
- identical ignition-input SHA-256; and
- only the detector position changed in the copied scenario.

This is a model counterfactual. It does not establish that the new detector position is operationally optimal.

## Evidence handoff check

The controlled fabric-and-vent research spot remains at `[1.7, 2.1, 2.3] m`. It produces the query `solid material flammability forced airflow microgravity fabric`. The scenario supplies a vent location and an illustrative radial influence, but no physical velocity, so airflow speed remains `unknown` and no airflow-speed condition is inserted into the evidence search.

## Validation and trust-boundary tests

The simulator suite now checks:

- bounded output and exact raw-score reconstruction;
- deterministic replay for a fixed seed;
- identical sampled-location hashes across batch sizes;
- different sampled-location hashes for different seeds;
- expected oxygen, pressure, detector, and local-oxygen behavior;
- gravity remaining recorded with no score effect;
- hotspot explanations coming from the actual aggregated calculation;
- exact-GLB hash verification;
- the same-sample detector counterfactual;
- unknown airflow speed in the fabric-and-vent handoff;
- finite geometry, integer grids, compartment bounds, and unique object IDs;
- explicit material coefficients and gravity metadata, with no silent numeric defaults for missing values;
- legacy scenario `0.1.0` and reviewed scenario `0.2.0` contract handling;
- metre-unit confirmation and complete mesh review;
- a one-to-one match between confirmed roles and scored objects;
- rejection of ignored objects added to scoring;
- rejection of duplicate or reclassified scored roles; and
- confirmed noncombustible structure remaining excluded from the score.

## Commands used

```bash
python simulator/benchmark.py
python simulator/build_cabin_release.py
python -m unittest discover -s simulator -p 'test_*.py' -v
python -m unittest discover -s analysis -p 'test_*.py'
npm run test:search
npm run build
```

The project-wide `npm run check` command runs the search tests, analysis tests, simulator tests, and production build together when the virtual environment is active.

## Final automated check

- 32 simulator and API tests passed.
- 22 search, handoff, and UI-shell tests passed.
- 15 analysis tests passed; one socket/CORS integration test was skipped because the execution sandbox blocks local sockets.
- The Vite production build completed successfully.
- The scenario schema parsed as valid JSON.
- The regenerated cabin release was byte-for-byte deterministic across repeated builds.

## Remaining validation work

Before the output can support engineering or mission-safety decisions, the team still needs to:

1. derive versioned coefficients from traceable test-level evidence;
2. define the model’s valid oxygen, pressure, material, and flow ranges;
3. compare outputs against held-out microgravity combustion experiments;
4. add sensitivity and uncertainty propagation for every illustrative coefficient;
5. model directional transport and time-dependent behavior or connect to validated CFD; and
6. obtain domain-expert review of assumptions, geometry interpretation, and acceptance criteria.

