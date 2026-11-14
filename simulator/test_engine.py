import json
import copy
import unittest
from pathlib import Path

import torch

from engine import ROOT, ignition_input_hash, score_points, select_device, simulate, validate_scenario


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

    def test_returned_raw_term_recreates_relative_index(self):
        device = select_device("cpu")
        point = torch.tensor([[1.4, 0.8, 1.2]], dtype=torch.float32)
        fields = score_points(point, self.scenario, device)
        recreated = 100 * (1 - torch.exp(-fields["raw_score"]))
        self.assertTrue(torch.allclose(fields["risk_index"], recreated, atol=1e-6))
        self.assertIn("delta_detector_gap", fields)
        self.assertIn("delta_ventilation", fields)

    def test_simulation_is_deterministic(self):
        first = simulate(self.scenario, 20_000, 5_000, 42, "cpu", 5)
        second = simulate(self.scenario, 20_000, 5_000, 42, "cpu", 5)
        self.assertEqual(first["summary"], second["summary"])
        self.assertEqual(first["hotspots"], second["hotspots"])
        self.assertEqual(first["reproducibility"], second["reproducibility"])

    def test_hotspot_explanation_comes_from_aggregated_calculation(self):
        result = simulate(self.scenario, 20_000, 5_000, 42, "cpu", 5)
        hotspot = result["hotspots"][0]
        self.assertEqual(result["metric_name"], "relative screening index")
        self.assertGreater(len(hotspot["nearby_objects"]), 0)
        self.assertEqual(len(hotspot["score_breakdown"]["strongest_contributors"]), 5)
        values = hotspot["score_breakdown"]["actual_term_means"]
        recreated = 100 * (1 - torch.exp(torch.tensor(-values["raw_score"])))
        self.assertAlmostEqual(float(recreated), hotspot["relative_screening_index"], delta=0.2)

    def test_more_detection_does_not_raise_local_score(self):
        device = select_device("cpu")
        point = torch.tensor([[6.6, 3.1, 0.7]], dtype=torch.float32)
        base = float(score_points(point, self.scenario, device)["risk_index"][0])
        modified = json.loads(json.dumps(self.scenario))
        modified["detectors"].append({"id": "test", "position_m": [6.6, 3.1, 0.7], "influence_radius_m": 2, "effectiveness": 1})
        covered = float(score_points(point, modified, device)["risk_index"][0])
        self.assertLessEqual(covered, base)

    def test_local_oxygen_source_raises_nearby_score(self):
        device = select_device("cpu")
        point = torch.tensor([[6.9, 1.0, 1.1]], dtype=torch.float32)
        enriched = float(score_points(point, self.scenario, device)["risk_index"][0])
        modified = json.loads(json.dumps(self.scenario))
        modified["oxygen_sources"] = []
        baseline = float(score_points(point, modified, device)["risk_index"][0])
        self.assertGreaterEqual(enriched, baseline)

    def test_local_oxygen_is_bounded(self):
        device = select_device("cpu")
        point = torch.tensor([[6.9, 1.0, 1.1]], dtype=torch.float32)
        local_oxygen = score_points(point, self.scenario, device)["local_oxygen_percent"]
        self.assertTrue(bool(torch.all(local_oxygen <= 100)))
        self.assertTrue(bool(torch.all(local_oxygen > 0)))

    def test_gravity_is_recorded_but_does_not_change_score(self):
        device = select_device("cpu")
        points = torch.tensor([[1.4, 0.8, 1.2], [6.9, 1.0, 1.1]], dtype=torch.float32)
        modified = copy.deepcopy(self.scenario)
        modified["environment"]["gravity_g"] = 1.0
        first = score_points(points, self.scenario, device)["risk_index"]
        second = score_points(points, modified, device)["risk_index"]
        self.assertTrue(torch.equal(first, second))

    def test_detector_move_uses_same_samples_and_ignition_inputs(self):
        scenario = json.loads((ROOT / "simulator/cabin_demo_scenario.json").read_text())
        voxel = [28, 1, 0]
        baseline = simulate(scenario, 20_000, 10_000, 2026, "cpu", 5, [voxel])
        modified = copy.deepcopy(scenario)
        modified["detectors"][0]["position_m"] = [5.7, 0.3, 0.1]
        changed = simulate(modified, 20_000, 10_000, 2026, "cpu", 5, [voxel])
        before = baseline["probes"]["28,1,0"]
        after = changed["probes"]["28,1,0"]
        self.assertEqual(baseline["reproducibility"]["sample_locations_sha256"], changed["reproducibility"]["sample_locations_sha256"])
        self.assertEqual(ignition_input_hash(scenario), ignition_input_hash(modified))
        self.assertGreater(after["detection_coverage"], before["detection_coverage"])
        self.assertLess(after["relative_screening_index"], before["relative_screening_index"])

    def test_fabric_vent_search_keeps_airflow_speed_unknown(self):
        scenario = json.loads((ROOT / "simulator/cabin_demo_scenario.json").read_text())
        result = simulate(scenario, 10_000, 10_000, 2026, "cpu", 5, [[8, 10, 11]])
        search = result["probes"]["8,10,11"]["evidence_search"]
        self.assertIn("forced airflow", search["query"])
        self.assertIsNone(search["airflow_speed"])
        self.assertIn("unknown", search["airflow_speed_status"])

    def test_precomputed_exact_glb_release_has_verified_counterfactual(self):
        result = json.loads((ROOT / "public/simulation/cabin-demo.json").read_text())
        comparison = result["controlled_comparison"]
        self.assertEqual(result["precomputed_fixture"]["model_sha256"], "335206796c175bf3791b8ca0b76a3208462cb2268b5af32d601ccab43a29ac1a")
        self.assertTrue(comparison["verification"]["same_sample_locations"])
        self.assertTrue(comparison["verification"]["ignition_inputs_unchanged"])
        self.assertGreater(comparison["change"]["detection_coverage"], 0)
        self.assertLess(comparison["change"]["relative_screening_index"], 0)


if __name__ == "__main__":
    unittest.main()
