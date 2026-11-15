"""Build the precomputed exact-GLB result and controlled detector comparison."""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path

from engine import ROOT, simulate


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_release(scenario_path: Path, benchmark_path: Path, output_path: Path) -> dict:
    scenario = json.loads(scenario_path.read_text())
    benchmark = json.loads(benchmark_path.read_text())
    source_model = scenario.get("source_model", {})
    public_model_path = ROOT / "public" / str(source_model.get("path", "")).lstrip("/")
    if not public_model_path.is_file():
        raise ValueError(f"Exact fixture model does not exist: {public_model_path}")
    actual_model_sha256 = file_sha256(public_model_path)
    expected_model_sha256 = source_model.get("sha256")
    if actual_model_sha256 != expected_model_sha256:
        raise ValueError(
            "Exact fixture model SHA-256 does not match the reviewed scenario: "
            f"expected {expected_model_sha256}, got {actual_model_sha256}"
        )
    samples = int(benchmark["recommended_default_samples"])
    seed = 2026
    # This voxel intersects the curtain's modeled material influence and the
    # supply vent's radial influence in the exact, hashed fixture geometry.
    fabric_vent_voxel = [8, 10, 11]
    baseline = simulate(
        scenario, samples, min(100_000, samples), seed, "cpu", 25,
        probe_voxels=[fabric_vent_voxel],
    )
    target = baseline["hotspots"][0]

    modified = copy.deepcopy(scenario)
    detector = modified["detectors"][0]
    original_position = detector["position_m"]
    detector["position_m"] = target["center_m"]
    reconstructed = copy.deepcopy(modified)
    reconstructed["detectors"][0]["position_m"] = original_position
    only_detector_position_changed = reconstructed == scenario
    if not only_detector_position_changed:
        raise ValueError("Controlled comparison changed more than the selected detector position")
    changed = simulate(
        modified, samples, min(100_000, samples), seed, "cpu", 25,
        probe_voxels=[target["voxel"]],
    )
    changed_spot = changed["probes"][",".join(str(value) for value in target["voxel"])]
    comparison = {
        "title": "Move the detector to the selected hotspot and rerun the same locations",
        "target_rank": target["rank"],
        "target_voxel": target["voxel"],
        "target_center_m": target["center_m"],
        "detector_id": detector["id"],
        "detector_position_before_m": original_position,
        "detector_position_after_m": detector["position_m"],
        "baseline": {
            "detection_coverage": target["detection_coverage"],
            "relative_screening_index": target["relative_screening_index"],
        },
        "after_move": {
            "detection_coverage": changed_spot["detection_coverage"],
            "relative_screening_index": changed_spot["relative_screening_index"],
        },
        "change": {
            "detection_coverage": round(changed_spot["detection_coverage"] - target["detection_coverage"], 4),
            "relative_screening_index": round(changed_spot["relative_screening_index"] - target["relative_screening_index"], 4),
        },
        "verification": {
            "same_sample_locations": baseline["reproducibility"]["sample_locations_sha256"] == changed["reproducibility"]["sample_locations_sha256"],
            "same_sample_locations_sha256": baseline["reproducibility"]["sample_locations_sha256"],
            "ignition_inputs_unchanged": baseline["reproducibility"]["ignition_inputs_sha256"] == changed["reproducibility"]["ignition_inputs_sha256"],
            "ignition_inputs_sha256": baseline["reproducibility"]["ignition_inputs_sha256"],
            "only_detector_position_changed": only_detector_position_changed,
            "only_intended_change": "detector position in the copied scenario",
        },
        "interpretation": "This is a controlled model counterfactual, not evidence that the placement is operationally optimal.",
    }
    baseline["controlled_comparison"] = comparison
    target["controlled_comparison"] = comparison
    research_spot = baseline["probes"][",".join(str(value) for value in fabric_vent_voxel)]
    research_spot["title"] = "Fabric + vent evidence-search spot"
    research_spot["selection_note"] = "Controlled geometry probe where the curtain and supply-vent influence regions overlap; shown for research context and not inserted into the ranked top-hotspot list."
    baseline["research_spots"] = [research_spot]
    baseline["benchmark_summary"] = {
        "recommended_default_samples": samples,
        "recommendation": benchmark["recommendation"],
        "method": benchmark["method"],
    }
    baseline["precomputed_fixture"] = {
        "model_path": scenario["source_model"]["path"],
        "model_sha256": actual_model_sha256,
        "model_sha256_verified": True,
        "scenario_path": "simulator/cabin_demo_scenario.json",
        "result_status": "precomputed, repeatable synthetic research fixture",
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(baseline, indent=2) + "\n")
    return baseline


if __name__ == "__main__":
    result = build_release(
        ROOT / "simulator/cabin_demo_scenario.json",
        ROOT / "public/simulation/benchmark.json",
        ROOT / "public/simulation/cabin-demo.json",
    )
    comparison = result["controlled_comparison"]
    print(
        f"Wrote precomputed result with {result['samples']:,} samples; detector coverage "
        f"{comparison['baseline']['detection_coverage']:.3f} -> {comparison['after_move']['detection_coverage']:.3f}."
    )
