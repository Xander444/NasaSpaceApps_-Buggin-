"""Explainable PyTorch analysis for sourced NASA PSI investigation metadata.

This is deliberately not a predictive safety model. It creates feature tensors,
tracks missing numeric fields separately, and ranks related records using only
overlapping reported evidence.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as F

ROOT = Path(__file__).resolve().parents[1]
NUMERIC = [
    "oxygen_percent_min", "oxygen_percent_max", "flow_cm_s_min",
    "flow_cm_s_max", "pressure_atm_min", "pressure_atm_max",
]
CATEGORICAL = ["platform", "fuel_class"]
MULTI = ["materials", "focus", "sensors"]


def load_records(path: Path) -> list[dict[str, Any]]:
    records = json.loads(path.read_text())
    ids = [record["id"] for record in records]
    if len(ids) != len(set(ids)):
        raise ValueError("Investigation IDs must be unique")
    return records


def vocabulary(records: list[dict[str, Any]], field: str) -> list[str]:
    values: set[str] = set()
    for record in records:
        item = record.get(field)
        values.update(item if isinstance(item, list) else [item])
    return sorted(value for value in values if value)


def encode(records: list[dict[str, Any]]) -> tuple[torch.Tensor, torch.Tensor, list[str]]:
    """Return features, observability mask, and human-readable feature names."""
    columns: list[torch.Tensor] = []
    masks: list[torch.Tensor] = []
    names: list[str] = []

    for field in NUMERIC:
        observed = torch.tensor([r.get(field) is not None for r in records], dtype=torch.float32)
        values = torch.tensor([float(r.get(field) or 0.0) for r in records])
        if observed.sum() > 1:
            known = values[observed.bool()]
            values[observed.bool()] = (known - known.mean()) / known.std().clamp_min(1e-6)
        values *= observed
        columns.append(values[:, None]); masks.append(observed[:, None]); names.append(field)

    for field in CATEGORICAL + MULTI:
        for token in vocabulary(records, field):
            values = torch.tensor([
                float(token in (r.get(field) or [])) if isinstance(r.get(field), list)
                else float(r.get(field) == token) for r in records
            ])
            columns.append(values[:, None]); masks.append(torch.ones_like(values[:, None])); names.append(f"{field}:{token}")

    return torch.cat(columns, 1), torch.cat(masks, 1), names


def pairwise_similarity(features: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    """Cosine similarity over fields observed for both members of each pair."""
    rows = []
    for i in range(features.shape[0]):
        scores = []
        for j in range(features.shape[0]):
            shared = mask[i] * mask[j]
            left, right = features[i] * shared, features[j] * shared
            score = F.cosine_similarity(left[None], right[None], dim=1).item()
            scores.append(score if shared.sum() else 0.0)
        rows.append(scores)
    return torch.tensor(rows)


def explain_pair(i: int, j: int, features: torch.Tensor, mask: torch.Tensor, names: list[str]) -> list[str]:
    shared = mask[i].bool() & mask[j].bool()
    matching = shared & (features[i] == features[j]) & (features[i] != 0)
    return [names[k] for k in torch.where(matching)[0].tolist()]


def run(data_path: Path, output_path: Path) -> dict[str, Any]:
    records = load_records(data_path)
    features, mask, names = encode(records)
    similarity = pairwise_similarity(features, mask)
    results = []
    for i, record in enumerate(records):
        order = torch.argsort(similarity[i], descending=True).tolist()
        neighbors = []
        for j in order:
            if i == j:
                continue
            neighbors.append({
                "id": records[j]["id"],
                "score": round(float(similarity[i, j]), 4),
                "shared_evidence": explain_pair(i, j, features, mask, names)[:8],
            })
        results.append({"id": record["id"], "nearest": neighbors[:3]})
    payload = {
        "method": "masked cosine similarity over sourced investigation metadata",
        "warning": "Exploratory retrieval aid; not a fire-risk prediction or safety recommendation.",
        "record_count": len(records), "feature_count": len(names), "results": results,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n")
    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=ROOT / "data/investigations.json")
    parser.add_argument("--output", type=Path, default=ROOT / "public/analysis.json")
    args = parser.parse_args()
    summary = run(args.data, args.output)
    print(f"Analyzed {summary['record_count']} records across {summary['feature_count']} features")

