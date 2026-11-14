# Frontend team contract

The frontend can be redesigned freely as long as it consumes the versioned contracts rather than duplicating scientific data in components.

## Inputs

- Study catalog: `data/psi/catalog.json`
- Test records: `data/psi/normalized/bass_ii_tests.json`
- Evidence similarity: `public/analysis.json`
- Simulator result: `public/simulation/demo.json`
- Scenario example: `simulator/demo_scenario.json`
- Scenario schema: `simulator/scenario.schema.json`
- Annotation rules: `docs/ANNOTATION_CONTRACT.md`
- Live local endpoint: `POST /api/simulate`

## Simulator result fields

- `classification`: must remain visibly displayed.
- `summary`: overall relative screening indices.
- `hotspots`: ranked 3D voxel centers with uncertainty and coverage.
- `risk_voxels_p75`: compact `[x, y, z, risk]` list for visualization.
- `scene`: materials, ignition and oxygen sources, vents, detectors, suppressors, and consequence zones.
- `assumptions`: must be accessible beside any result.
- `evidence_bindings`: describes which NASA studies provide context.

## Language rules

Use “risk index,” “screening,” “candidate hotspot,” and “coverage gap.” Do not display the index as a probability, predicted incident rate, safety certification, or mission approval.

Do not call the current object-name heuristic AI, computer vision, or material recognition. Suggestions must remain visually distinct from confirmed labels. Changing a confirmed category or coefficient must invalidate the confirmation.

## UI work still open

- 3D layer toggles
- Hotspot selection and details
- Side-by-side scenario comparison
- Evidence drawer and citations
- Accessibility and keyboard controls
- Export/import of a reviewed annotation manifest
