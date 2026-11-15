"""Local API for confirmed, browser-authored screening scenarios."""
from __future__ import annotations

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from research.api import router as research_router
from research.middleware import ResearchLimits

from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from engine import simulate


class SimulationRequest(BaseModel):
    scenario: dict[str, Any]
    samples: int = Field(default=100_000, ge=1_000, le=2_000_000)
    seed: int = 2026


app = FastAPI(
    title="Flame in Freefall local screening API",
    version="0.4.0",
    description="Runs only scenarios whose object labels and model scale were reviewed by a person.",
)

app.include_router(research_router)
app.add_middleware(ResearchLimits)

CATEGORY_COLLECTIONS = {
    "materials": "material",
    "ignition_sources": "ignition_source",
    "oxygen_sources": "oxygen_source",
    "vents": "vent",
    "detectors": "detector",
    "suppressors": "suppressor",
    "consequence_zones": "consequence_zone",
}
EXCLUDED_CONFIRMED_CATEGORIES = {"structural_noncombustible"}


def validate_confirmation(scenario: dict[str, Any]) -> None:
    confirmation = scenario.get("confirmation", {})
    if not isinstance(confirmation, dict):
        raise ValueError("scenario.confirmation must be an object")
    manifest = confirmation.get("manifest", [])
    total = confirmation.get("total_object_count")
    reviewed = confirmation.get("reviewed_object_count")
    if confirmation.get("model_units_m_confirmed") is not True:
        raise ValueError("Confirm that model dimensions are in metres before simulation")
    if not isinstance(total, int) or total < 1:
        raise ValueError("confirmation.total_object_count must be a positive integer")
    if not isinstance(manifest, list) or any(not isinstance(item, dict) for item in manifest):
        raise ValueError("confirmation.manifest must be an array of objects")
    if reviewed != total or len(manifest) != total:
        raise ValueError("Every selectable object must be confirmed or explicitly ignored")
    object_ids = [item.get("object_id") for item in manifest]
    if any(not object_id for object_id in object_ids) or len(set(object_ids)) != total:
        raise ValueError("Confirmation manifest must contain one unique entry per object")
    allowed = {"confirmed", "ignored"}
    if any(item.get("review_status") not in allowed for item in manifest):
        raise ValueError("Every manifest entry needs a confirmed or ignored review status")

    manifest_by_id = {item["object_id"]: item for item in manifest}
    scored_roles: dict[str, str] = {}
    for collection, expected_category in CATEGORY_COLLECTIONS.items():
        items = scenario.get(collection, [])
        if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
            raise ValueError(f"scenario.{collection} must be an array of objects")
        for item in items:
            object_id = item.get("id")
            if object_id in scored_roles:
                raise ValueError(f"Scored object {object_id} appears in more than one role")
            scored_roles[object_id] = expected_category
            reviewed_item = manifest_by_id.get(object_id)
            if reviewed_item is None:
                raise ValueError(f"Scored object {object_id} is missing from the confirmation manifest")
            if reviewed_item.get("review_status") != "confirmed":
                raise ValueError(f"Scored object {object_id} was not confirmed")
            if reviewed_item.get("category") != expected_category:
                raise ValueError(
                    f"Scored object {object_id} is in {collection} but was confirmed as "
                    f"{reviewed_item.get('category') or 'unknown'}"
                )

    supported_categories = set(CATEGORY_COLLECTIONS.values()) | EXCLUDED_CONFIRMED_CATEGORIES
    unsupported = sorted({
        str(item.get("category")) for item in manifest
        if item.get("review_status") == "confirmed" and item.get("category") not in supported_categories
    })
    if unsupported:
        raise ValueError(f"Confirmed manifest contains unsupported roles: {', '.join(unsupported)}")

    confirmed_roles = {
        object_id: item.get("category") for object_id, item in manifest_by_id.items()
        if item.get("review_status") == "confirmed"
        and item.get("category") not in EXCLUDED_CONFIRMED_CATEGORIES
    }
    if scored_roles != confirmed_roles:
        omitted = sorted(set(confirmed_roles) - set(scored_roles))
        unexpected = sorted(set(scored_roles) - set(confirmed_roles))
        details = []
        if omitted:
            details.append(f"confirmed objects omitted from scoring: {', '.join(omitted)}")
        if unexpected:
            details.append(f"unconfirmed objects included in scoring: {', '.join(unexpected)}")
        raise ValueError("Confirmation manifest and scored objects disagree; " + "; ".join(details))


def run_confirmed_simulation(payload: SimulationRequest) -> dict[str, Any]:
    validate_confirmation(payload.scenario)
    return simulate(
        payload.scenario,
        samples=payload.samples,
        batch_size=min(100_000, payload.samples),
        seed=payload.seed,
        device_name="auto",
        top_k=25,
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": "relative spatial screening"}


@app.post("/api/simulate")
def simulate_endpoint(payload: SimulationRequest) -> dict[str, Any]:
    try:
        return run_confirmed_simulation(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=False)
