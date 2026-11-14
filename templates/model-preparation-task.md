# Teammate task: prepare a 3D model for screening

## Goal

Produce a small, non-sensitive `.glb` model that can be reviewed object by object in the first-release simulator.

## Requirements

- Use metres as the model unit.
- Separate meaningful objects into individual meshes.
- Give each mesh a descriptive, unique name. Avoid names such as `Cube.001`.
- Keep the model origin and orientation documented.
- Remove hidden duplicates, decorative geometry, and sensitive design details not required for a hackathon demonstration.
- Do not assign simulator labels automatically in the source file; the reviewer must confirm them in the application.

Suggested names include `fabric-curtain`, `power-distribution`, `oxygen-manifold`, `supply-vent`, `smoke-detector`, `portable-suppressor`, and `crew-egress-zone`.

## Acceptance check

1. Import the GLB at `/simulator`.
2. Verify the displayed dimensions against a known length.
3. Click every object and confirm it can be selected independently.
4. Confirm or ignore every mesh.
5. Verify that editing a confirmed label returns it to the unreviewed state.
6. Confirm metre units and run the one-million-location screen with the local API.

Record any mesh that cannot be selected separately; it must be split in the source model before it can be classified reliably.
