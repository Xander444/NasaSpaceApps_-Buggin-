# Human-confirmed 3D annotation contract

The first release treats automatic recognition as a suggestion, never as accepted truth. A simulation request is valid only when a person has reviewed every selectable mesh and either confirmed a role or explicitly ignored it.

## Accepted model files

- `.glb` is preferred because geometry and textures can be contained in one file.
- `.gltf` works only when it is self-contained. External `.bin` or texture files are not loaded in this release.
- The model should be split into meaningful meshes with useful names such as `oxygen-manifold`, `smoke-detector`, or `fabric-curtain`.
- The user must confirm that coordinates and dimensions are in metres. The application does not guess or rescale units.

The importer resolves every mesh through its full world transform before annotation. Parent and child translations, rotations, and scales are therefore included, and the model is shifted once so its world-space minimum is `[0, 0, 0]`. Hotspot voxels and reviewed object bounds use that same normalized coordinate system.

The first release sends world-axis-aligned bounding boxes to the scorer, not triangle meshes or oriented boxes. This is repeatable and keeps the overlay aligned with the geometry used by the calculation, but a large diagonal wall can produce a box containing empty space. Split long walls or complex interiors into meaningful meshes when tighter spatial screening is needed. The application never silently changes a model from millimetres to metres; the human metre-unit check remains mandatory.

STEP, IGES, STL, OBJ, floor-plan images, and point clouds are intentionally deferred. Supporting them consistently requires a controlled conversion and segmentation service.

## Review states

Every object starts as `unreviewed`, even when the recognizer reports a high confidence. The only accepted terminal states are:

- `confirmed`: the user selected and confirmed a simulator role;
- `ignored`: the user deliberately excluded reference or irrelevant geometry.

Editing a confirmed category or coefficient returns that object to `unreviewed`. The local API refuses a scenario if the manifest is incomplete, contains duplicate object IDs, or lacks the metre-scale confirmation.

## Recognition boundary

The current recognizer is a deterministic object-name heuristic. It provides a suggested role, confidence-like name-match score, and reason. It is not a trained vision model and does not inspect pixels or infer hidden material properties. This makes its behavior reproducible while a validated model and labeled evaluation set are still unavailable.

Any future learned recognizer must preserve the same human-confirmation gate and record:

1. model name and version;
2. input model hash;
3. suggested label and calibrated confidence;
4. final human label;
5. reviewer and timestamp when an identity system exists; and
6. an evaluation report by category, including abstentions.

## Simulator roles

- combustible material;
- ignition source;
- oxygen source;
- vent / forced flow;
- detector;
- suppressor;
- critical or occupied consequence zone;
- noncombustible structure; and
- ignored reference geometry.

Geometry supplies only position and bounding-box size. Material, ignition, oxygen, ventilation, detection, suppression, and consequence coefficients remain user-reviewed screening assumptions. They are not measurements inferred from NASA data.

## Provenance

Imported model bytes are hashed with SHA-256 in the browser. The original model remains in the browser; only the derived object map, labels, bounds, environment, model hash, and review manifest are sent to the local PyTorch service.

NASA PSI investigations are evidence bindings that explain why variables are represented:

- BASS-II (`PSI-25`) for solid fuels, oxygen, and forced-flow context;
- Saffire-I (`PSI-98`) for large-scale spacecraft-fire context; and
- SAME-R (`PSI-101`) for smoke-detection context.

These sources do not calibrate the first-release coefficients. Missing measurements remain unknown.
