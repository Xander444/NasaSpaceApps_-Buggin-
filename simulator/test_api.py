import json
import unittest

from api import SimulationRequest, run_confirmed_simulation, validate_confirmation
from engine import ROOT


class ApiConfirmationTests(unittest.TestCase):
    def setUp(self):
        self.scenario = json.loads((ROOT / "simulator/cabin_demo_scenario.json").read_text())

    def test_complete_manifest_is_accepted(self):
        validate_confirmation(self.scenario)

    def test_confirmed_noncombustible_structure_is_valid_but_not_scored(self):
        structure = self.scenario["confirmation"]["manifest"][0]
        structure["review_status"] = "confirmed"
        structure["category"] = "structural_noncombustible"
        validate_confirmation(self.scenario)

    def test_unreviewed_object_is_rejected(self):
        self.scenario["confirmation"]["reviewed_object_count"] -= 1
        with self.assertRaisesRegex(ValueError, "Every selectable object"):
            validate_confirmation(self.scenario)

    def test_unconfirmed_units_are_rejected(self):
        self.scenario["confirmation"]["model_units_m_confirmed"] = False
        with self.assertRaisesRegex(ValueError, "metres"):
            validate_confirmation(self.scenario)

    def test_confirmed_request_runs(self):
        result = run_confirmed_simulation(
            SimulationRequest(scenario=self.scenario, samples=1_000, seed=7)
        )
        self.assertEqual(result["samples"], 1_000)
        self.assertEqual(result["seed"], 7)

    def test_ignored_mesh_cannot_be_added_to_scoring(self):
        ignored = self.scenario["confirmation"]["manifest"][0]
        self.scenario["ignition_sources"].append({
            "id": ignored["object_id"], "position_m": [1, 1, 1],
            "influence_radius_m": 1, "weight": 1,
        })
        with self.assertRaisesRegex(ValueError, "was not confirmed"):
            validate_confirmation(self.scenario)

    def test_confirmed_role_must_match_scored_collection(self):
        material_id = self.scenario["materials"][0]["id"]
        manifest_item = next(item for item in self.scenario["confirmation"]["manifest"]
                             if item["object_id"] == material_id)
        manifest_item["category"] = "detector"
        with self.assertRaisesRegex(ValueError, "was confirmed as detector"):
            validate_confirmation(self.scenario)

    def test_confirmed_mesh_cannot_be_omitted_from_scoring(self):
        omitted = self.scenario["materials"].pop()
        with self.assertRaisesRegex(ValueError, omitted["id"]):
            validate_confirmation(self.scenario)

    def test_scored_mesh_cannot_appear_in_two_roles(self):
        material = self.scenario["materials"][0]
        self.scenario["detectors"].append({
            "id": material["id"], "position_m": material["position_m"],
            "influence_radius_m": 1, "effectiveness": 0.5,
        })
        with self.assertRaisesRegex(ValueError, "more than one role"):
            validate_confirmation(self.scenario)

    def test_malformed_manifest_and_collections_are_rejected_cleanly(self):
        self.scenario["confirmation"]["manifest"] = "not an array"
        with self.assertRaisesRegex(ValueError, "manifest must be an array"):
            validate_confirmation(self.scenario)
        self.setUp()
        self.scenario["detectors"] = ["not an object"]
        with self.assertRaisesRegex(ValueError, "scenario.detectors must be an array of objects"):
            validate_confirmation(self.scenario)


if __name__ == "__main__":
    unittest.main()
