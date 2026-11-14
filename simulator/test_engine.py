import json
import unittest
from pathlib import Path

import torch

from engine import ROOT, score_points, select_device, simulate, validate_scenario


class SimulatorTests(unittest.TestCase):
    def setUp(self):
        self.scenario = json.loads((ROOT / "simulator/demo_scenario.json").read_text())

    def test_demo_scenario_is_valid(self):
        validate_scenario(self.scenario)

    def test_scores_are_bounded(self):
        device = select_device("cpu")
        points = torch.tensor([[1.4, 0.8, 1.2], [7.9, 3.9, 2.9]], dtype=torch.float32)
        scores = score_points(points, self.scenario, device)["risk_index"]
        self.assertTrue(bool(torch.all(scores >= 0)))
        self.assertTrue(bool(torch.all(scores <= 100)))

    def test_simulation_is_deterministic(self):
        first = simulate(self.scenario, 20_000, 5_000, 42, "cpu", 5)
        second = simulate(self.scenario, 20_000, 5_000, 42, "cpu", 5)
        self.assertEqual(first["summary"], second["summary"])
        self.assertEqual(first["hotspots"], second["hotspots"])

    def test_more_detection_does_not_raise_local_score(self):
        device = select_device("cpu")
        point = torch.tensor([[6.6, 3.1, 0.7]], dtype=torch.float32)
        base = float(score_points(point, self.scenario, device)["risk_index"][0])
        modified = json.loads(json.dumps(self.scenario))
        modified["detectors"].append({"id": "test", "position_m": [6.6, 3.1, 0.7], "influence_radius_m": 2, "effectiveness": 1})
        covered = float(score_points(point, modified, device)["risk_index"][0])
        self.assertLessEqual(covered, base)


if __name__ == "__main__":
    unittest.main()
