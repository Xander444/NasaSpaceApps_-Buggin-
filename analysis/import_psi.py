"""Import public NASA PSI metadata and experimental tables with provenance.

The importer intentionally stores raw experimental cells alongside parsed values.
Ambiguous cells such as "5 3 2 ext" remain text instead of being guessed.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
API = "https://psi.nasa.gov/geode-py/ws/repo/investigations/{accession}"
DOWNLOAD = "https://psi.nasa.gov/geode-py/ws/studies/{accession}/download"
DEFAULT_ACCESSIONS = ["PSI-25", "PSI-26", "PSI-62", "PSI-69", "PSI-98", "PSI-99", "PSI-100", "PSI-101", "PSI-102"]


def exact_number(value: str | None) -> float | None:
    """Parse only cells that are entirely numeric; never select from a sequence."""
    text = (value or "").strip()
    if not re.fullmatch(r"[-+]?\d+(?:\.\d+)?", text):
        return None
    return float(text)


def exact_int(value: str | None) -> int | None:
    number = exact_number(value)
    return int(number) if number is not None and number.is_integer() else None


def file_category(file_name: str, accession: str) -> str:
    prefix = f"{accession}_"
    remainder = file_name[len(prefix):] if file_name.startswith(prefix) else file_name
    return remainder.split("_", 1)[0].strip() or "Uncategorized"


def normalize_metadata(raw: dict[str, Any]) -> dict[str, Any]:
    files = [item for item in raw.get("added", []) if item.get("visible", True)]
    categories: dict[str, int] = {}
    for item in files:
        category = file_category(item.get("file_name", ""), raw["accession"])
        categories[category] = categories.get(category, 0) + 1
    return {
        "accession": raw["accession"],
        "title": raw.get("title"),
        "acronym": raw.get("investigationAcronym"),
        "doi": raw.get("doi"),
        "version": raw.get("version"),
        "modified_date": raw.get("modifiedDate"),
        "project_type": raw.get("projectType"),
        "flight_program": raw.get("flightProgram"),
        "start_date": raw.get("investigationStartDate"),
        "end_date": raw.get("investigationEndDate"),
        "research_area": raw.get("researchArea"),
        "sub_research_area": raw.get("subResearchArea"),
        "hardware": raw.get("experimentHardware"),
        "objective": raw.get("objective"),
        "approach": raw.get("approach"),
        "hypothesis": raw.get("hypothesis"),
        "research_impacts": raw.get("researchImpacts"),
        "related_investigations": [x.strip() for x in (raw.get("related_glds") or "").split(",") if x.strip()],
        "publication_count": len(raw.get("publications", [])),
        "public_file_count": len(files),
        "public_file_bytes": sum(float(item.get("file_size") or 0) for item in files),
        "file_categories": dict(sorted(categories.items())),
        "experimental_table_count": len(raw.get("experimentalTable", [])),
        "source_url": f"https://psi.nasa.gov/physci/repo/data/investigations/{raw['accession']}",
        "api_url": API.format(accession=raw["accession"]),
        "license": raw.get("licenseIdentifier"),
    }


def normalize_file_inventory(raw: dict[str, Any]) -> list[dict[str, Any]]:
    output = []
    for item in raw.get("added", []):
        if not item.get("visible", True):
            continue
        output.append({
            "accession": raw["accession"],
            "file_name": item.get("file_name"),
            "category": file_category(item.get("file_name", ""), raw["accession"]),
            "subcategory": item.get("subcategory") or None,
            "bytes": item.get("file_size"),
            "version": item.get("version"),
            "restricted": bool(item.get("restricted", False)),
            "s3_path": item.get("s3_path"),
        })
    return output


def download_public_file(session: requests.Session, accession: str, item: dict[str, Any]) -> bytes:
    response = session.get(DOWNLOAD.format(accession=accession), params={
        "file": item["file_name"], "version": item.get("version", 1), "redirect": "false"
    }, timeout=60)
    response.raise_for_status()
    signed_url = response.text.strip()
    file_response = session.get(signed_url, timeout=120)
    file_response.raise_for_status()
    return file_response.content


def parse_bass_ii_csv(content: bytes, source_name: str) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
    rows = []
    for index, row in enumerate(reader, start=2):
        rows.append({
            "record_id": f"PSI-25:{(row.get('Test #') or '').strip()}",
            "accession": "PSI-25",
            "test_id": (row.get("Test #") or "").strip() or None,
            "principal_investigator": (row.get("PI") or "").strip() or None,
            "test_date_raw": (row.get("Date") or "").strip() or None,
            "gmt_raw": (row.get("GMT") or "").strip() or None,
            "sample_id": (row.get("Sample #") or "").strip() or None,
            "material_description": (row.get("Fuel Sample Material") or "").strip() or None,
            "flow_restrictor_raw": (row.get("Flow restrictor") or "").strip() or None,
            "fan_display_raw": (row.get("Fan display") or "").strip() or None,
            "air_display_raw": (row.get("Air display") or "").strip() or None,
            "radiometer_gain_raw": (row.get("Radiometer gain   (1000   250   50   10)") or "").strip() or None,
            "total_frames": exact_int(row.get("Total Frames Shot")),
            "total_frames_raw": (row.get("Total Frames Shot") or "").strip() or None,
            "oxygen_initial_percent": exact_number(row.get("Calibrated  initial O2 % by vol ")),
            "oxygen_final_percent": exact_number(row.get("Calibrated final O2 % by vol")),
            "co2_initial_percent": exact_number(row.get("Initial CO2 % by vol")),
            "co2_final_percent": exact_number(row.get("Final CO2 % by vol")),
            "co_initial_ppm": exact_number(row.get("Initial CO (ppm)")),
            "co_final_ppm": exact_number(row.get("Final CO (ppm)")),
            "source_file": source_name,
            "source_row": index,
        })
    return rows


def parse_generic_csv(content: bytes, accession: str, source_name: str) -> list[dict[str, Any]]:
    """Preserve every table cell as source text for later investigation-specific parsing."""
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("cp1252")
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for index, row in enumerate(reader, start=2):
        rows.append({
            "accession": accession,
            "source_file": source_name,
            "source_row": index,
            "raw": {(key or "unnamed").strip(): (value.strip() if value else None) for key, value in row.items()},
        })
    return rows


def import_all(accessions: list[str], output: Path) -> dict[str, Any]:
    session = requests.Session()
    session.headers["User-Agent"] = "FlameInFreefall/0.3 NASA-Space-Apps educational importer"
    output.mkdir(parents=True, exist_ok=True)
    tables_dir = output / "tables"
    normalized_dir = output / "normalized"
    tables_dir.mkdir(exist_ok=True); normalized_dir.mkdir(exist_ok=True)
    catalog, inventory, manifest, errors = [], [], [], []

    for accession in accessions:
        try:
            response = session.get(API.format(accession=accession), timeout=60)
            response.raise_for_status()
            raw = response.json()
            catalog.append(normalize_metadata(raw))
            inventory.extend(normalize_file_inventory(raw))
            for table in raw.get("experimentalTable", []):
                if table.get("restricted") or not table.get("visible", True):
                    continue
                content = download_public_file(session, accession, table)
                destination = tables_dir / table["file_name"]
                destination.write_bytes(content)
                manifest.append({
                    "accession": accession, "file": str(destination.relative_to(ROOT)),
                    "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(),
                    "source_file_name": table["file_name"], "source_version": table.get("version"),
                })
                if destination.suffix.lower() == ".csv":
                    generic_rows = parse_generic_csv(content, accession, table["file_name"])
                    (normalized_dir / f"{accession.lower()}_table_rows_raw.json").write_text(json.dumps(generic_rows, indent=2) + "\n")
                    if accession == "PSI-25":
                        rows = parse_bass_ii_csv(content, table["file_name"])
                        (normalized_dir / "bass_ii_tests.json").write_text(json.dumps(rows, indent=2) + "\n")
        except Exception as error:  # preserve partial imports and make failures visible
            errors.append({"accession": accession, "error": f"{type(error).__name__}: {error}"})

    catalog.sort(key=lambda x: x["accession"])
    inventory.sort(key=lambda x: (x["accession"], x["file_name"] or ""))
    (output / "catalog.json").write_text(json.dumps(catalog, indent=2) + "\n")
    (output / "file_inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "requested_accessions": accessions,
        "imported_investigations": len(catalog),
        "indexed_public_files": len(inventory),
        "downloaded_tables": manifest,
        "errors": errors,
        "license_note": "Source records report CC0-1.0; verify each investigation before redistribution.",
    }
    (output / "manifest.json").write_text(json.dumps(payload, indent=2) + "\n")
    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--accession", action="append", dest="accessions")
    parser.add_argument("--output", type=Path, default=ROOT / "data/psi")
    args = parser.parse_args()
    result = import_all(args.accessions or DEFAULT_ACCESSIONS, args.output)
    print(json.dumps(result, indent=2))
