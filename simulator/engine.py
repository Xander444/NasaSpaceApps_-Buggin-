"""Explainable PyTorch 3D fire-risk screening engine.

This is a Monte Carlo spatial screening model, not CFD and not a calibrated
probability-of-fire calculator. Output is a relative screening index.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import torch

ROOT = Path(__file__).resolve().parents[1]
SUPPORTED_SCENARIO_VERSIONS = {"0.1.0", "0.2.0"}

AGGREGATE_FIELDS = (
    "source_exposure", "ignition_susceptibility", "local_oxygen_percent",
    "oxygen_modifier", "pressure_modifier", "spread_potential", "smoke_yield",
    "ventilation_influence", "detection_coverage", "suppression_coverage",
    "consequence", "ignition_term", "spread_factor", "detection_factor",
    "suppression_factor", "consequence_factor", "raw_score",
    "delta_material_ignition", "delta_ignition_source", "delta_oxygen",
    "delta_pressure", "delta_spread", "delta_ventilation",
    "delta_detector_gap", "delta_suppression_gap", "delta_consequence",
)

CONTRIBUTION_LABELS = {
    "delta_material_ignition": "Combustible-material ignition susceptibility",
    "delta_ignition_source": "Nearby ignition-source exposure",
    "delta_oxygen": "Oxygen modifier",
    "delta_pressure": "Pressure modifier",
    "delta_spread": "Material spread potential",
    "delta_ventilation": "Vent / forced-flow influence",
    "delta_detector_gap": "Detector coverage gap",
    "delta_suppression_gap": "Suppression coverage gap",
    "delta_consequence": "Consequence-zone proximity",
}


def tensor3(value: list[float], device: torch.device) -> torch.Tensor:
    if len(value) != 3:
        raise ValueError(f"Expected three coordinates, got {value}")
    return torch.tensor(value, dtype=torch.float32, device=device)


def select_device(requested: str) -> torch.device:
    if requested != "auto":
        return torch.device(requested)
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def canonical_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def ignition_input_hash(scenario: dict[str, Any]) -> str:
    """Hash ignition inputs while intentionally excluding detector placement."""
    environment = scenario.get("environment", {})
    return canonical_hash({
        "environment": {
            "oxygen_percent": environment.get("oxygen_percent"),
            "pressure_kpa": environment.get("pressure_kpa"),
        },
        "materials": scenario.get("materials", []),
        "ignition_sources": scenario.get("ignition_sources", []),
        "oxygen_sources": scenario.get("oxygen_sources", []),
    })


def validate_scenario(scenario: dict[str, Any]) -> None:
    def bounded(value: Any, label: str, low: float | None = None,
                high: float | None = None) -> float:
        try:
            number = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{label} must be a number") from exc
        if not math.isfinite(number):
            raise ValueError(f"{label} must be finite")
        if low is not None and number < low:
            raise ValueError(f"{label} must be >= {low}")
        if high is not None and number > high:
            raise ValueError(f"{label} must be <= {high}")
        return number

    def finite_vector(value: Any, label: str, *, positive: bool = False) -> list[float]:
        if not isinstance(value, (list, tuple)) or len(value) != 3:
            raise ValueError(f"{label} must contain three numbers")
        minimum = 0.0000001 if positive else None
        return [bounded(component, f"{label}[{index}]", minimum)
                for index, component in enumerate(value)]

    if not isinstance(scenario, dict):
        raise ValueError("Scenario must be an object")
    schema_version = scenario.get("schema_version")
    if schema_version not in SUPPORTED_SCENARIO_VERSIONS:
        versions = ", ".join(sorted(SUPPORTED_SCENARIO_VERSIONS))
        raise ValueError(f"scenario.schema_version must be one of: {versions}")
    if schema_version == "0.2.0":
        source_model = scenario.get("source_model")
        if not isinstance(source_model, dict) or not all(
                isinstance(source_model.get(field), str) and source_model[field].strip()
                for field in ("name", "format", "sha256")):
            raise ValueError("scenario.source_model must identify the reviewed model")
        if not isinstance(scenario.get("confirmation"), dict):
            raise ValueError("scenario.confirmation must be an object for schema 0.2.0")
    if not isinstance(scenario.get("name"), str) or not scenario["name"].strip():
        raise ValueError("scenario.name must be a non-empty string")
    compartment = scenario.get("compartment")
    if not isinstance(compartment, dict):
        raise ValueError("scenario.compartment must be an object")
    dimensions = compartment.get("dimensions_m")
    grid = compartment.get("grid")
    dimensions = finite_vector(dimensions, "compartment.dimensions_m", positive=True)
    if (not isinstance(grid, (list, tuple)) or len(grid) != 3 or
            any(isinstance(value, bool) or not isinstance(value, int) or value < 2 for value in grid)):
        raise ValueError("compartment.grid must contain three integers >= 2")
    environment = scenario.get("environment")
    if not isinstance(environment, dict):
        raise ValueError("scenario.environment must be an object")
    bounded(environment.get("oxygen_percent"), "environment.oxygen_percent", 0.1, 100)
    bounded(environment.get("pressure_kpa"), "environment.pressure_kpa", 0.1)
    bounded(environment.get("gravity_g"), "environment.gravity_g", 0)
    if "ambient_temperature_c" in environment:
        bounded(environment["ambient_temperature_c"], "environment.ambient_temperature_c")

    seen_ids: dict[str, str] = {}
    for collection in ("ignition_sources", "oxygen_sources", "materials", "vents", "detectors", "suppressors", "consequence_zones"):
        items = scenario.get(collection, [])
        if not isinstance(items, list):
            raise ValueError(f"scenario.{collection} must be an array")
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(f"Every {collection} entry must be an object")
            identifier = item.get("id")
            if not isinstance(identifier, str) or not identifier.strip():
                raise ValueError(f"Every {collection} entry needs a non-empty id")
            if identifier in seen_ids:
                raise ValueError(
                    f"Object id {identifier} appears in both {seen_ids[identifier]} and {collection}"
                )
            seen_ids[identifier] = collection
            position = finite_vector(item.get("position_m"), f"{collection}.{identifier}.position_m")
            if any(component < 0 or component > dimensions[index]
                   for index, component in enumerate(position)):
                raise ValueError(f"{collection}.{identifier}.position_m lies outside the compartment")
            if collection != "materials":
                bounded(item.get("influence_radius_m"), f"{collection}.{identifier}.influence_radius_m", 0.0001)
    if not scenario.get("materials"):
        raise ValueError("At least one material region is required")
    for item in scenario["materials"]:
        finite_vector(item.get("size_m"), f"materials.{item['id']}.size_m", positive=True)
        bounded(item.get("influence_radius_m"), f"materials.{item['id']}.influence_radius_m", 0.0001)
        for field in ("ignition_susceptibility", "spread_potential", "smoke_yield"):
            bounded(item.get(field), f"materials.{item['id']}.{field}", 0, 1)
    bounds = {
        "ignition_sources": ("weight", 0, 2), "oxygen_sources": ("oxygen_percent_boost", 0, 100),
        "vents": ("strength", 0, 2), "detectors": ("effectiveness", 0, 1),
        "suppressors": ("effectiveness", 0, 1), "consequence_zones": ("weight", 0, 3),
    }
    for collection, (field, low, high) in bounds.items():
        for item in scenario.get(collection, []):
            bounded(item.get(field), f"{collection}.{item['id']}.{field}", low, high)
    for item in scenario.get("vents", []):
        finite_vector(item.get("direction"), f"vents.{item['id']}.direction")


def radial_field(points: torch.Tensor, items: list[dict[str, Any]], value_key: str,
                 device: torch.device, combine: str = "max") -> torch.Tensor:
    if not items:
        return torch.zeros(points.shape[0], device=device)
    fields = []
    for item in items:
        center = tensor3(item["position_m"], device)
        radius = max(float(item.get("influence_radius_m", 1.0)), 1e-4)
        distance = torch.linalg.vector_norm(points - center, dim=1)
        fields.append(float(item.get(value_key, 0.0)) * torch.exp(-0.5 * (distance / radius) ** 2))
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
        falloff = torch.exp(-distance / max(float(material["influence_radius_m"]), 1e-4))
        ignition.append(float(material["ignition_susceptibility"]) * falloff)
        spread.append(float(material["spread_potential"]) * falloff)
        smoke.append(float(material["smoke_yield"]) * falloff)
    return tuple(torch.stack(field, dim=1).max(dim=1).values for field in (ignition, spread, smoke))


def risk_from_inputs(source: torch.Tensor, ignition: torch.Tensor,
                     oxygen_modifier: torch.Tensor, pressure_modifier: torch.Tensor,
                     spread: torch.Tensor, ventilation: torch.Tensor,
                     detection: torch.Tensor, suppression: torch.Tensor,
                     consequence: torch.Tensor) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
    ignition_term = (0.03 + source) * ignition * oxygen_modifier * pressure_modifier
    spread_factor = 0.35 + 0.65 * spread * (1 + 0.45 * ventilation)
    detection_factor = 0.45 + 0.55 * (1 - detection)
    suppression_factor = 0.55 + 0.45 * (1 - suppression)
    consequence_factor = 1 + consequence
    raw = ignition_term * spread_factor * detection_factor * suppression_factor * consequence_factor
    index = 100 * (1 - torch.exp(-raw.clamp(min=0)))
    return index.clamp(0, 100), {
        "ignition_term": ignition_term, "spread_factor": spread_factor,
        "detection_factor": detection_factor, "suppression_factor": suppression_factor,
        "consequence_factor": consequence_factor, "raw_score": raw,
    }


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
    pressure_value = min(max(math.sqrt(max(pressure, 1.0) / 101.325), 0.4), 1.5)
    pressure_modifier = torch.full_like(local_oxygen, pressure_value)
    source = radial_field(points, scenario.get("ignition_sources", []), "weight", device, "sum").clamp(0, 2)
    ignition, spread, smoke = material_fields(points, scenario["materials"], device)
    ventilation = radial_field(points, scenario.get("vents", []), "strength", device, "sum").clamp(0, 2)
    detection = radial_field(points, scenario.get("detectors", []), "effectiveness", device, "max").clamp(0, 1)
    suppression = radial_field(points, scenario.get("suppressors", []), "effectiveness", device, "max").clamp(0, 1)
    consequence = radial_field(points, scenario.get("consequence_zones", []), "weight", device, "max").clamp(0, 3)
    zeros, ones = torch.zeros_like(source), torch.ones_like(source)
    risk_index, terms = risk_from_inputs(
        source, ignition, oxygen_modifier, pressure_modifier, spread, ventilation,
        detection, suppression, consequence,
    )

    def counterfactual(**changes: torch.Tensor) -> torch.Tensor:
        values = {
            "source": source, "ignition": ignition, "oxygen_modifier": oxygen_modifier,
            "pressure_modifier": pressure_modifier, "spread": spread, "ventilation": ventilation,
            "detection": detection, "suppression": suppression, "consequence": consequence,
        }
        values.update(changes)
        return risk_from_inputs(**values)[0]

    # Same-point counterfactual effects from the exact scoring function. They are
    # deliberately not presented as additive shares because the formula multiplies terms.
    deltas = {
        "delta_material_ignition": risk_index - counterfactual(ignition=zeros),
        "delta_ignition_source": risk_index - counterfactual(source=zeros),
        "delta_oxygen": risk_index - counterfactual(oxygen_modifier=ones),
        "delta_pressure": risk_index - counterfactual(pressure_modifier=ones),
        "delta_spread": risk_index - counterfactual(spread=zeros),
        "delta_ventilation": risk_index - counterfactual(ventilation=zeros),
        "delta_detector_gap": risk_index - counterfactual(detection=ones),
        "delta_suppression_gap": risk_index - counterfactual(suppression=ones),
        "delta_consequence": risk_index - counterfactual(consequence=zeros),
    }
    return {
        "risk_index": risk_index, "source_exposure": source,
        "local_oxygen_percent": local_oxygen, "oxygen_modifier": oxygen_modifier,
        "pressure_modifier": pressure_modifier, "ignition_susceptibility": ignition,
        "spread_potential": spread, "smoke_yield": smoke,
        "ventilation_influence": ventilation, "detection_coverage": detection,
        "suppression_coverage": suppression, "consequence": consequence,
        **terms, **deltas,
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


def point_to_box_distance(point: list[float], center: list[float], size: list[float]) -> float:
    outside = [max(abs(point[i] - center[i]) - size[i] / 2, 0) for i in range(3)]
    return math.sqrt(sum(value * value for value in outside))


def nearby_objects(center: list[float], scenario: dict[str, Any], limit: int | None = 8) -> list[dict[str, Any]]:
    objects: list[dict[str, Any]] = []
    collections = (
        ("materials", "material"), ("ignition_sources", "ignition source"),
        ("oxygen_sources", "oxygen source"), ("vents", "vent"),
        ("detectors", "detector"), ("suppressors", "suppressor"),
        ("consequence_zones", "consequence zone"),
    )
    for collection, label in collections:
        for item in scenario.get(collection, []):
            distance = (point_to_box_distance(center, item["position_m"], item["size_m"])
                        if collection == "materials" else math.dist(center, item["position_m"]))
            radius = float(item.get("influence_radius_m", 0))
            objects.append({
                "id": item["id"], "type": label, "distance_m": round(distance, 4),
                "position_m": [round(float(value), 4) for value in item["position_m"]],
                "influence_radius_m": round(radius, 4),
                "within_modeled_influence": distance <= radius,
                "material_type": item.get("material_type"),
            })
    ranked = sorted(objects, key=lambda item: (item["distance_m"], item["type"], item["id"]))
    return ranked if limit is None else ranked[:limit]


def psi_search_url(query: str) -> str:
    return "https://psi.nasa.gov/physci/repo/search?" + urlencode({
        "q": query, "data_source": "psi", "data_type": "investigation",
    })


def handoff_object(item: dict[str, Any]) -> dict[str, Any]:
    return {key: item.get(key) for key in (
        "id", "type", "position_m", "distance_m", "influence_radius_m",
        "within_modeled_influence", "material_type",
    )}


def evidence_searches_for(nearby: list[dict[str, Any]], detection_coverage: float,
                          suppression_coverage: float) -> list[dict[str, Any]]:
    searches: list[dict[str, Any]] = []
    fabric = next((item for item in nearby if item["type"] == "material" and item["within_modeled_influence"] and
                   (item.get("material_type") == "fabric" or "fabric" in item["id"].lower() or
                    "curtain" in item["id"].lower())), None)
    vent = next((item for item in nearby if item["type"] == "vent" and item["within_modeled_influence"]), None)
    if fabric and vent:
        query = "solid material flammability forced airflow microgravity fabric"
        searches.append({
            "area": "flammability",
            "label": "Solid-material flammability under forced airflow",
            "query": query,
            "url": psi_search_url(query),
            "reason": f"This location is within the modeled influence of {fabric['id']} and {vent['id']}.",
            "relevant_objects": [handoff_object(fabric), handoff_object(vent)],
            "airflow_speed": None,
            "airflow_speed_status": "unknown — the scenario gives a vent location and illustrative influence, not a physical airflow speed",
        })

    detector = next((item for item in nearby if item["type"] == "detector"), None)
    detector_query = "spacecraft smoke detector response placement microgravity aerosols"
    detector_reason = (
        f"Nearest confirmed detector {detector['id']} is {detector['distance_m']:.2f} m away; "
        f"modeled coverage at this spot is {detection_coverage:.3f}."
        if detector else
        f"No confirmed detector is present; modeled coverage at this spot is {detection_coverage:.3f}."
    )
    searches.append({
        "area": "detection",
        "label": "Detector response and coverage",
        "query": detector_query,
        "url": psi_search_url(detector_query),
        "reason": detector_reason,
        "relevant_objects": [handoff_object(detector)] if detector else [],
        "modeled_coverage": round(detection_coverage, 4),
    })

    suppressor = next((item for item in nearby if item["type"] == "suppressor"), None)
    suppression_query = "spacecraft fire suppression extinguishment microgravity solid materials"
    suppression_reason = (
        f"Nearest confirmed suppressor {suppressor['id']} is {suppressor['distance_m']:.2f} m away; "
        f"modeled coverage at this spot is {suppression_coverage:.3f}."
        if suppressor else
        f"No confirmed suppressor is present; modeled coverage at this spot is {suppression_coverage:.3f}."
    )
    searches.append({
        "area": "suppression",
        "label": "Suppression and extinguishment coverage",
        "query": suppression_query,
        "url": psi_search_url(suppression_query),
        "reason": suppression_reason,
        "relevant_objects": [handoff_object(suppressor)] if suppressor else [],
        "modeled_coverage": round(suppression_coverage, 4),
    })
    return searches


def voxel_coordinates(flat_index: int, grid: torch.Tensor) -> list[int]:
    z = flat_index // int(grid[0] * grid[1])
    remainder = flat_index - z * int(grid[0] * grid[1])
    y = remainder // int(grid[0])
    return [remainder % int(grid[0]), y, z]


def flat_voxel(voxel: list[int], grid: torch.Tensor) -> int:
    return int(voxel[0] + int(grid[0]) * (voxel[1] + int(grid[1]) * voxel[2]))


def simulate(scenario: dict[str, Any], samples: int, batch_size: int, seed: int,
             device_name: str = "auto", top_k: int = 25,
             probe_voxels: list[list[int]] | None = None) -> dict[str, Any]:
    integer_inputs = {"samples": samples, "batch_size": batch_size, "seed": seed, "top_k": top_k}
    if any(isinstance(value, bool) or not isinstance(value, int)
           for value in integer_inputs.values()):
        raise ValueError("samples, batch_size, seed, and top_k must be integers")
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
    field_sums = {field: torch.zeros(voxel_count, device=device) for field in AGGREGATE_FIELDS}
    histogram = torch.zeros(101, dtype=torch.long, device=device)
    generator = torch.Generator(device=device.type).manual_seed(seed)
    sample_hasher = hashlib.sha256()

    completed = 0
    while completed < samples:
        current = min(batch_size, samples - completed)
        points = torch.rand((current, 3), generator=generator, device=device) * dimensions
        sample_hasher.update(points.detach().cpu().contiguous().numpy().tobytes())
        fields = score_points(points, scenario, device)
        risk = fields["risk_index"]
        _, flat = voxel_indices(points, dimensions, grid)
        sums.scatter_add_(0, flat, risk)
        sums_squared.scatter_add_(0, flat, risk * risk)
        counts.scatter_add_(0, flat, torch.ones_like(risk))
        for field, accumulator in field_sums.items():
            accumulator.scatter_add_(0, flat, fields[field])
        histogram += torch.bincount(torch.round(risk).long().clamp(0, 100), minlength=101)
        completed += current

    safe_counts = counts.clamp_min(1)
    means = sums / safe_counts
    variances = (sums_squared / safe_counts - means * means).clamp_min(0)
    standard_errors = torch.sqrt(variances / safe_counts)
    field_means = {field: values / safe_counts for field, values in field_sums.items()}
    ranked = torch.argsort(means, descending=True)

    def hotspot_record(flat_index: int, rank: int | None = None) -> dict[str, Any]:
        voxel = voxel_coordinates(flat_index, grid)
        center = ((torch.tensor(voxel, device=device) + 0.5) / grid * dimensions).tolist()
        all_nearby = nearby_objects(center, scenario, limit=None)
        nearby = all_nearby[:8]
        detection_coverage = float(field_means["detection_coverage"][flat_index])
        suppression_coverage = float(field_means["suppression_coverage"][flat_index])
        evidence_searches = evidence_searches_for(
            all_nearby, detection_coverage, suppression_coverage,
        )
        contributions = [{
            "term": field.removeprefix("delta_"), "label": CONTRIBUTION_LABELS[field],
            "counterfactual_delta": round(float(field_means[field][flat_index]), 4),
            "direction": "raises index" if float(field_means[field][flat_index]) >= 0 else "lowers index",
        } for field in CONTRIBUTION_LABELS]
        contributions.sort(key=lambda item: abs(item["counterfactual_delta"]), reverse=True)
        actual_terms = {field: round(float(field_means[field][flat_index]), 4)
                        for field in AGGREGATE_FIELDS if not field.startswith("delta_")}
        record = {
            "voxel": voxel, "center_m": [round(value, 4) for value in center],
            "relative_screening_index": round(float(means[flat_index]), 4),
            "risk_index": round(float(means[flat_index]), 4),
            "standard_error": round(float(standard_errors[flat_index]), 4),
            "sample_count": int(counts[flat_index]),
            "detection_coverage": round(detection_coverage, 4),
            "suppression_coverage": round(suppression_coverage, 4),
            "nearby_objects": nearby,
            "score_breakdown": {
                "method": "mean actual terms and same-sample counterfactual deltas from the scoring calculation",
                "non_additive_note": "Deltas do not sum to the index because scoring terms interact multiplicatively.",
                "actual_term_means": actual_terms,
                "strongest_contributors": contributions[:5],
                "all_counterfactual_contributors": contributions,
            },
            "evidence_search": evidence_searches[0] if evidence_searches else None,
            "evidence_searches": evidence_searches,
        }
        if rank is not None:
            record["rank"] = rank
        return record

    hotspots = [hotspot_record(index, rank) for rank, index in
                enumerate(ranked[:top_k].tolist(), start=1)]
    probes: dict[str, Any] = {}
    for voxel in probe_voxels or []:
        if len(voxel) != 3 or any(value < 0 or value >= int(grid[i]) for i, value in enumerate(voxel)):
            raise ValueError(f"Probe voxel {voxel} lies outside the grid")
        probes[",".join(str(value) for value in voxel)] = hotspot_record(flat_voxel(voxel, grid))

    occupied_means = means[counts > 0]
    threshold = float(torch.quantile(occupied_means, 0.75))
    compact_voxels = [[*voxel_coordinates(index, grid), round(float(means[index]), 3)]
                      for index in torch.where((means >= threshold) & (counts > 0))[0].tolist()]

    environment = scenario["environment"]
    confirmation = scenario.get("confirmation", {})
    mean_index = round(float((sums.sum() / counts.sum()).item()), 4)
    p95_index = percentile_from_histogram(histogram, 0.95)
    maximum_index = round(float(means.max()), 4)
    assumptions = [
        "Relative screening index, not probability of ignition or mission loss.",
        "No CFD, chemistry, radiative heat transfer, oxygen depletion, material consumption, or time evolution is solved.",
        "Material, source, vent, detector, suppressor, and consequence coefficients are illustrative scenario inputs—not measured or NASA-calibrated coefficients.",
        "Gravity and ambient temperature are recorded but have no effect on this score.",
        "Smoke yield is recorded for future model extension but has no effect on this score.",
        "Detector and suppressor effects are radial coverage approximations.",
        "Local oxygen-source enrichment is a radial screening assumption, not a gas-dispersion solution.",
    ]
    return {
        "schema_version": "0.2.0", "scenario_name": scenario["name"],
        "model": "Flame-in-Freefall PyTorch Monte Carlo spatial screening v0.2",
        "classification": "research prototype / not safety-certified",
        "metric_name": "relative screening index",
        "samples": samples, "batch_size": batch_size, "seed": seed, "device": str(device),
        "reproducibility": {
            "scenario_sha256": canonical_hash(scenario),
            "ignition_inputs_sha256": ignition_input_hash(scenario),
            "sample_locations_sha256": sample_hasher.hexdigest(),
            "sampling": "torch.rand uniform XYZ, seeded once and batched in the recorded batch size",
        },
        "dimensions_m": scenario["compartment"]["dimensions_m"], "grid": scenario["compartment"]["grid"],
        "summary": {
            "mean_relative_screening_index": mean_index,
            "p95_relative_screening_index": p95_index,
            "maximum_voxel_relative_screening_index": maximum_index,
            "hotspot_threshold_p75": round(threshold, 4),
            "mean_risk_index": mean_index, "p95_risk_index": p95_index,
            "maximum_voxel_risk_index": maximum_index,
        },
        "hotspots": hotspots, "probes": probes, "risk_voxels_p75": compact_voxels,
        "scene": {
            "materials": scenario.get("materials", []), "ignition_sources": scenario.get("ignition_sources", []),
            "oxygen_sources": scenario.get("oxygen_sources", []), "vents": scenario.get("vents", []),
            "detectors": scenario.get("detectors", []), "suppressors": scenario.get("suppressors", []),
            "consequence_zones": scenario.get("consequence_zones", []),
        },
        "environment": environment,
        "assumption_context": {
            "user_entered_cabin_conditions": [
                {"field": "oxygen_percent", "value": environment.get("oxygen_percent"), "used_in_score": True},
                {"field": "pressure_kpa", "value": environment.get("pressure_kpa"), "used_in_score": True},
                {"field": "gravity_g", "value": environment.get("gravity_g"), "used_in_score": False,
                 "note": "recorded only; the current score has no gravity term"},
                {"field": "ambient_temperature_c", "value": environment.get("ambient_temperature_c"), "used_in_score": False,
                 "note": "recorded only; the current score has no temperature term"},
            ],
            "illustrative_coefficients": [
                "material ignition susceptibility, spread potential, and smoke yield",
                "ignition-source weight and local oxygen boost",
                "vent influence, detector effectiveness, suppressor effectiveness, and consequence weight",
                "fixed formula constants (0.03, 0.35/0.65, 0.45/0.55, and ventilation multiplier 0.45)",
            ],
            "coefficient_status": "illustrative screening assumptions; not calibrated measurements",
            "mesh_confirmation": {
                "model_units_m_confirmed": confirmation.get("model_units_m_confirmed"),
                "total_object_count": confirmation.get("total_object_count"),
                "reviewed_object_count": confirmation.get("reviewed_object_count"),
                "review_basis": confirmation.get("review_basis", "human confirmation manifest supplied by the UI"),
            },
        },
        "assumptions": assumptions,
        "evidence_bindings": scenario.get("evidence_bindings", []),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", type=Path, default=ROOT / "simulator/demo_scenario.json")
    parser.add_argument("--output", type=Path, default=ROOT / "public/simulation/demo.json")
    parser.add_argument("--samples", type=int, default=100_000)
    parser.add_argument("--batch-size", type=int, default=100_000)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--device", default="auto")
    parser.add_argument("--top-k", type=int, default=25)
    args = parser.parse_args()
    scenario = json.loads(args.scenario.read_text())
    output = simulate(scenario, args.samples, args.batch_size, args.seed, args.device, args.top_k)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n")
    print(f"Simulated {args.samples:,} locations; wrote {args.output}")


if __name__ == "__main__":
    main()
