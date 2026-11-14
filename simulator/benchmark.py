"""Measure CPU latency and top-region stability for the exact cabin fixture."""
from __future__ import annotations

import argparse
import itertools
import json
import platform
import statistics
import time
from pathlib import Path
from typing import Any

import torch

from engine import ROOT, simulate


def neighborhood_retention(first: dict[str, Any], second: dict[str, Any], top_n: int = 10) -> float:
    a = [item["voxel"] for item in first["hotspots"][:top_n]]
    b = [item["voxel"] for item in second["hotspots"][:top_n]]

    def retained(source: list[list[int]], target: list[list[int]]) -> float:
        return sum(any(max(abs(x[i] - y[i]) for i in range(3)) <= 1 for y in target)
                   for x in source) / len(source)

    return (retained(a, b) + retained(b, a)) / 2


def exact_jaccard(first: dict[str, Any], second: dict[str, Any], top_n: int = 25) -> float:
    a = {tuple(item["voxel"]) for item in first["hotspots"][:top_n]}
    b = {tuple(item["voxel"]) for item in second["hotspots"][:top_n]}
    return len(a & b) / len(a | b)


def benchmark(scenario: dict[str, Any], sample_counts: list[int], seeds: list[int]) -> dict[str, Any]:
    simulate(scenario, 10_000, 10_000, 1, "cpu", 25)
    reports = []
    for count in sample_counts:
        results, durations = [], []
        for seed in seeds:
            started = time.perf_counter()
            result = simulate(scenario, count, min(100_000, count), seed, "cpu", 25)
            durations.append(time.perf_counter() - started)
            results.append(result)
        pairs = list(itertools.combinations(results, 2))
        retention = [neighborhood_retention(a, b) for a, b in pairs]
        jaccard = [exact_jaccard(a, b) for a, b in pairs]
        reports.append({
            "samples": count,
            "run_seconds": [round(value, 4) for value in durations],
            "median_seconds": round(statistics.median(durations), 4),
            "maximum_seconds": round(max(durations), 4),
            "mean_top10_region_retention": round(statistics.mean(retention), 4),
            "minimum_top10_region_retention": round(min(retention), 4),
            "mean_exact_top25_jaccard": round(statistics.mean(jaccard), 4),
            "top_regions_by_seed": [
                {"seed": seed, "top5_voxels": [hotspot["voxel"] for hotspot in result["hotspots"][:5]]}
                for seed, result in zip(seeds, results)
            ],
        })
    eligible = [report for report in reports
                if report["mean_top10_region_retention"] >= 0.8
                and report["minimum_top10_region_retention"] >= 0.6
                and report["mean_exact_top25_jaccard"] >= 0.75
                and report["median_seconds"] <= 5]
    selected = eligible[0] if eligible else reports[-1]
    return {
        "schema_version": "0.1.0",
        "scenario": scenario["name"],
        "method": {
            "device": "cpu",
            "seeds": seeds,
            "top_region_rule": "same voxel or one-voxel Chebyshev neighbor among each run's top 10",
            "default_rule": "smallest count with mean top-10 region retention >= 0.80, minimum pair retention >= 0.60, mean exact top-25 Jaccard >= 0.75, and median CPU latency <= 5 s",
        },
        "runtime": {"python": platform.python_version(), "torch": torch.__version__, "processor": platform.processor() or platform.machine()},
        "results": reports,
        "recommended_default_samples": selected["samples"],
        "recommendation": (
            f"Use {selected['samples']:,} samples by default: median CPU latency was "
            f"{selected['median_seconds']:.3f} s and mean top-10 region retention across seeds was "
            f"{selected['mean_top10_region_retention']:.0%}."
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", type=Path, default=ROOT / "simulator/cabin_demo_scenario.json")
    parser.add_argument("--output", type=Path, default=ROOT / "public/simulation/benchmark.json")
    parser.add_argument("--sample-counts", nargs="+", type=int, default=[50_000, 100_000, 250_000, 500_000])
    parser.add_argument("--seeds", nargs="+", type=int, default=[2026, 2027, 2028, 2029, 2030])
    args = parser.parse_args()
    report = benchmark(json.loads(args.scenario.read_text()), args.sample_counts, args.seeds)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(report["recommendation"])


if __name__ == "__main__":
    main()
