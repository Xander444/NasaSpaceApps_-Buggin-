"""Local API for confirmed, browser-authored screening scenarios."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from engine import simulate


class SimulationRequest(BaseModel):
    scenario: dict[str, Any]
    samples: int = Field(default=1_000_000, ge=1_000, le=2_000_000)
    seed: int = 2026


app = FastAPI(
    title="Flame in Freefall local screening API",
    version="0.4.0",
    description="Runs only scenarios whose object labels and model scale were reviewed by a person.",
)


def validate_confirmation(scenario: dict[str, Any]) -> None:
    confirmation = scenario.get("confirmation", {})
    manifest = confirmation.get("manifest", [])
    total = confirmation.get("total_object_count")
    reviewed = confirmation.get("reviewed_object_count")
    if confirmation.get("model_units_m_confirmed") is not True:
        raise ValueError("Confirm that model dimensions are in metres before simulation")
    if not isinstance(total, int) or total < 1:
        raise ValueError("confirmation.total_object_count must be a positive integer")
    if reviewed != total or len(manifest) != total:
        raise ValueError("Every selectable object must be confirmed or explicitly ignored")
    object_ids = [item.get("object_id") for item in manifest]
    if any(not object_id for object_id in object_ids) or len(set(object_ids)) != total:
        raise ValueError("Confirmation manifest must contain one unique entry per object")
    allowed = {"confirmed", "ignored"}
    if any(item.get("review_status") not in allowed for item in manifest):
        raise ValueError("Every manifest entry needs a confirmed or ignored review status")


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
