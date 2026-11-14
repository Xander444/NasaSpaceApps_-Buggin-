"""Batched PyTorch 3D fire-risk screening engine.

This is a Monte Carlo spatial screening model, not CFD and not a calibrated
probability-of-fire calculator. Inputs describe assumptions; output is a
relative risk index for finding candidate hotspots and coverage gaps.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

import torch

ROOT = Path(__file__).resolve().parents[1]


def tensor3(value: list[float], device: torch.device) -> torch.Tensor:
    if len(value) != 3:
        raise ValueError(f"Expected three coordinates, got {value}")
    return torch.tensor(value, dtype=torch.float32, device=device)


def select_device(requested: str) -> torch.device:
    if requested != "auto":
        return torch.device(requested)
    if torch.cuda.is_available():
        return torch.device("cuda")
    # MPS scatter operations vary by PyTorch/macOS version; CPU is the stable default.
    return torch.device("cpu")


def validate_scenario(scenario: dict[str, Any]) -> None:
    def bounded_number(value: Any, label: str, minimum: float | None = None,
                       maximum: float | None = None) -> float:
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{label} must be a number") from exc
        if not math.isfinite(number):
            raise ValueError(f"{label} must be finite")
        if minimum is not None and number < minimum:
            raise ValueError(f"{label} must be >= {minimum}")
        if maximum is not None and number > maximum:
            raise ValueError(f"{label} must be <= {maximum}")
        return number

    dimensions = scenario.get("compartment", {}).get("dimensions_m")
    grid = scenario.get("compartment", {}).get("grid")
    if not dimensions or len(dimensions) != 3 or any(float(x) <= 0 for x in dimensions):
        raise ValueError("compartment.dimensions_m must contain three positive numbers")
    if not grid or len(grid) != 3 or any(int(x) < 2 for x in grid):
        raise ValueError("compartment.grid must contain three integers >= 2")
    environment = scenario.get("environment", {})
    bounded_number(environment.get("oxygen_percent"), "environment.oxygen_percent", 0.1, 100)
    bounded_number(environment.get("pressure_kpa"), "environment.pressure_kpa", 0.1)
    bounded_number(environment.get("gravity_g", 0), "environment.gravity_g", 0)
    for collection in ("ignition_sources", "oxygen_sources", "materials", "vents", "detectors", "suppressors", "consequence_zones"):
        for item in scenario.get(collection, []):
            if "id" not in item:
                raise ValueError(f"Every {collection} entry needs an id")
            if "position_m" in item and len(item["position_m"]) != 3:
                raise ValueError(f"{collection}.{item['id']}.position_m must contain three numbers")
            if collection != "materials":
                bounded_number(item.get("influence_radius_m"), f"{collection}.{item['id']}.influence_radius_m", 0.0001)
    if not scenario.get("materials"):
        raise ValueError("At least one material region is required")
    for item in scenario["materials"]:
        if len(item.get("size_m", [])) != 3 or any(float(value) <= 0 for value in item["size_m"]):
            raise ValueError(f"materials.{item['id']}.size_m must contain three positive numbers")
        bounded_number(item.get("influence_radius_m", 0.35), f"materials.{item['id']}.influence_radius_m", 0.0001)
        for field in ("ignition_susceptibility", "spread_potential", "smoke_yield"):
            bounded_number(item.get(field, 0.5), f"materials.{item['id']}.{field}", 0, 1)
    bounds = {
        "ignition_sources": ("weight", 0, 2), "oxygen_sources": ("oxygen_percent_boost", 0, 100),
        "vents": ("strength", 0, 2), "detectors": ("effectiveness", 0, 1),
        "suppressors": ("effectiveness", 0, 1), "consequence_zones": ("weight", 0, 3),
    }
    for collection, (field, lower, upper) in bounds.items():
        for item in scenario.get(collection, []):
            bounded_number(item.get(field), f"{collection}.{item['id']}.{field}", lower, upper)


def radial_field(points: torch.Tensor, items: list[dict[str, Any]], value_key: str,
                 device: torch.device, combine: str = "max") -> torch.Tensor:
    if not items:
        return torch.zeros(points.shape[0], device=device)
    fields = []
    for item in items:
        center = tensor3(item["position_m"], device)
        radius = max(float(item.get("influence_radius_m", 1.0)), 1e-4)
        value = float(item.get(value_key, 0.0))
        distance = torch.linalg.vector_norm(points - center, dim=1)
        fields.append(value * torch.exp(-0.5 * (distance / radius) ** 2))
    stacked = torch.stack(fields, dim=1)
    return stacked.max(dim=1).values if combine == "max" else stacked.sum(dim=1)


def material_fields(points: torch.Tensor, materials: list[dict[str, Any]],
                    device: torch.device) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    ignition, spread, smoke = [], [], []
    for material in materials:
        center = tensor3(material["position_m"], device)
        half = tensor3(material["size_m"], device) / 2
        outside = torch.clamp(torch.abs(points - center) - half, min=0)
        distance = torch.linalg.vector_norm(outside, dim=1)
        falloff = torch.exp(-distance / max(float(material.get("influence_radius_m", 0.35)), 1e-4))
        ignition.append(float(material["ignition_susceptibility"]) * falloff)
        spread.append(float(material["spread_potential"]) * falloff)
        smoke.append(float(material.get("smoke_yield", 0.5)) * falloff)
    return tuple(torch.stack(field, dim=1).max(dim=1).values for field in (ignition, spread, smoke))


def score_points(points: torch.Tensor, scenario: dict[str, Any],
                 device: torch.device) -> dict[str, torch.Tensor]:
    environment = scenario["environment"]
    oxygen = float(environment["oxygen_percent"])
    pressure = float(environment["pressure_kpa"])
    oxygen_boost = radial_field(
        points, scenario.get("oxygen_sources", []), "oxygen_percent_boost", device, "sum"
    ).clamp(0, max(0.0, 100.0 - oxygen))
    local_oxygen = (oxygen + oxygen_boost).clamp(0.1, 100)
    oxygen_modifier = ((local_oxygen / 21.0) ** 1.5).clamp(0.2, 2.5)
    pressure_modifier = min(max(math.sqrt(max(pressure, 1.0) / 101.325), 0.4), 1.5)

    source = radial_field(points, scenario.get("ignition_sources", []), "weight", device, "sum").clamp(0, 2)
    ignition, spread, smoke = material_fields(points, scenario["materials"], device)
    ventilation = radial_field(points, scenario.get("vents", []), "strength", device, "sum").clamp(0, 2)
    detection = radial_field(points, scenario.get("detectors", []), "effectiveness", device, "max").clamp(0, 1)
    suppression = radial_field(points, scenario.get("suppressors", []), "effectiveness", device, "max").clamp(0, 1)
    consequence = radial_field(points, scenario.get("consequence_zones", []), "weight", device, "max").clamp(0, 3)

    ignition_term = (0.03 + source) * ignition * oxygen_modifier * pressure_modifier
    spread_term = spread * (1 + 0.45 * ventilation)
    detection_gap = 1 - detection
    suppression_gap = 1 - suppression
    consequence_term = 1 + consequence
    raw = ignition_term * (0.35 + 0.65 * spread_term) * (0.45 + 0.55 * detection_gap)
    raw *= (0.55 + 0.45 * suppression_gap) * consequence_term
    risk_index = 100 * (1 - torch.exp(-raw.clamp(min=0)))
    return {
        "risk_index": risk_index.clamp(0, 100), "source_exposure": source,
        "local_oxygen_percent": local_oxygen,
        "ignition_susceptibility": ignition, "spread_potential": spread,
        "smoke_yield": smoke, "ventilation_influence": ventilation,
        "detection_coverage": detection, "suppression_coverage": suppression,
        "consequence": consequence,
    }


def voxel_indices(points: torch.Tensor, dimensions: torch.Tensor,
                  grid: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
    xyz = torch.floor(points / dimensions * grid).long()
    xyz = torch.minimum(torch.maximum(xyz, torch.zeros_like(xyz)), grid.long() - 1)
    flat = xyz[:, 0] + grid[0] * (xyz[:, 1] + grid[1] * xyz[:, 2])
    return xyz, flat


def percentile_from_histogram(histogram: torch.Tensor, percentile: float) -> float:
    target = histogram.sum() * percentile
    index = int(torch.searchsorted(torch.cumsum(histogram, dim=0), target).item())
    return min(max(index, 0), 100)


def simulate(scenario: dict[str, Any], samples: int, batch_size: int, seed: int,
             device_name: str = "auto", top_k: int = 25) -> dict[str, Any]:
    if samples < 1 or batch_size < 1 or top_k < 1:
        raise ValueError("samples, batch_size, and top_k must be positive")
    validate_scenario(scenario)
    device = select_device(device_name)
    dimensions = tensor3(scenario["compartment"]["dimensions_m"], device)
    grid = torch.tensor(scenario["compartment"]["grid"], dtype=torch.long, device=device)
    voxel_count = int(torch.prod(grid).item())
    sums = torch.zeros(voxel_count, device=device)
    sums_squared = torch.zeros(voxel_count, device=device)
    counts = torch.zeros(voxel_count, device=device)
    detection_sums = torch.zeros(voxel_count, device=device)
    suppression_sums = torch.zeros(voxel_count, device=device)
    histogram = torch.zeros(101, dtype=torch.long, device=device)
    generator = torch.Generator(device=device.type).manual_seed(seed)

    completed = 0
    while completed < samples:
        current = min(batch_size, samples - completed)
        points = torch.rand((current, 3), generator=generator, device=device) * dimensions
        fields = score_points(points, scenario, device)
        risk = fields["risk_index"]
        _, flat = voxel_indices(points, dimensions, grid)
        ones = torch.ones_like(risk)
        sums.scatter_add_(0, flat, risk)
        sums_squared.scatter_add_(0, flat, risk * risk)
        counts.scatter_add_(0, flat, ones)
        detection_sums.scatter_add_(0, flat, fields["detection_coverage"])
        suppression_sums.scatter_add_(0, flat, fields["suppression_coverage"])
        histogram += torch.bincount(torch.round(risk).long().clamp(0, 100), minlength=101)
        completed += current

    safe_counts = counts.clamp_min(1)
    means = sums / safe_counts
    variances = (sums_squared / safe_counts - means * means).clamp_min(0)
    standard_errors = torch.sqrt(variances / safe_counts)
    detection_means = detection_sums / safe_counts
    suppression_means = suppression_sums / safe_counts
    ranked = torch.argsort(means, descending=True)

    hotspots = []
    for rank, flat_index in enumerate(ranked[:top_k].tolist(), start=1):
        z = flat_index // int(grid[0] * grid[1])
        remainder = flat_index - z * int(grid[0] * grid[1])
        y = remainder // int(grid[0])
        x = remainder % int(grid[0])
        center = ((torch.tensor([x, y, z], device=device) + 0.5) / grid * dimensions).tolist()
        hotspots.append({
            "rank": rank, "voxel": [x, y, z], "center_m": [round(v, 4) for v in center],
            "risk_index": round(float(means[flat_index]), 4),
            "standard_error": round(float(standard_errors[flat_index]), 4),
            "sample_count": int(counts[flat_index]),
            "detection_coverage": round(float(detection_means[flat_index]), 4),
            "suppression_coverage": round(float(suppression_means[flat_index]), 4),
        })

    compact_voxels = []
    threshold = float(torch.quantile(means[counts > 0], 0.75))
    for index in torch.where((means >= threshold) & (counts > 0))[0].tolist():
        z = index // int(grid[0] * grid[1]); rem = index - z * int(grid[0] * grid[1])
        y = rem // int(grid[0]); x = rem % int(grid[0])
        compact_voxels.append([x, y, z, round(float(means[index]), 3)])

    assumptions = [
        "Relative screening index, not probability of ignition or mission loss.",
        "No CFD, chemistry, radiative heat transfer, oxygen depletion, or material consumption is solved.",
        "Material coefficients are scenario inputs and require calibration before decision use.",
        "Detector and suppressor effects are radial coverage approximations.",
        "Local oxygen-source enrichment is a radial screening assumption, not a gas-dispersion solution.",
    ]
    return {
        "schema_version": "0.1.0", "scenario_name": scenario["name"],
        "model": "Flame-in-Freefall PyTorch Monte Carlo spatial screening v0.1",
        "classification": "research prototype / not safety-certified",
        "samples": samples, "batch_size": batch_size, "seed": seed, "device": str(device),
        "dimensions_m": scenario["compartment"]["dimensions_m"], "grid": scenario["compartment"]["grid"],
        "summary": {
            "mean_risk_index": round(float((sums.sum() / counts.sum()).item()), 4),
            "p95_risk_index": percentile_from_histogram(histogram, 0.95),
            "maximum_voxel_risk_index": round(float(means.max()), 4),
            "hotspot_threshold_p75": round(threshold, 4),
        },
        "hotspots": hotspots, "risk_voxels_p75": compact_voxels,
        "scene": {
            "materials": scenario.get("materials", []), "ignition_sources": scenario.get("ignition_sources", []),
            "oxygen_sources": scenario.get("oxygen_sources", []),
            "vents": scenario.get("vents", []), "detectors": scenario.get("detectors", []),
            "suppressors": scenario.get("suppressors", []), "consequence_zones": scenario.get("consequence_zones", []),
        },
        "environment": scenario["environment"], "assumptions": assumptions,
        "evidence_bindings": scenario.get("evidence_bindings", []),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", type=Path, default=ROOT / "simulator/demo_scenario.json")
    parser.add_argument("--output", type=Path, default=ROOT / "public/simulation/demo.json")
    parser.add_argument("--samples", type=int, default=1_000_000)
    parser.add_argument("--batch-size", type=int, default=100_000)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--top-k", type=int, default=25)
    args = parser.parse_args()
    scenario = json.loads(args.scenario.read_text())
    output = simulate(scenario, args.samples, args.batch_size, args.seed, args.device, args.top_k)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n")
    print(f"Simulated {args.samples:,} ignition locations; wrote {args.output}")


if __name__ == "__main__":
    main()
