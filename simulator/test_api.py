import json
import unittest

from api import SimulationRequest, run_confirmed_simulation, validate_confirmation
from engine import ROOT


class ApiConfirmationTests(unittest.TestCase):
    def setUp(self):
        self.scenario = json.loads((ROOT / "simulator/demo_scenario.json").read_text())
        self.scenario["confirmation"] = {
            "model_units_m_confirmed": True,
            "total_object_count": 2,
            "reviewed_object_count": 2,
            "manifest": [
                {"object_id": "a", "review_status": "confirmed", "category": "material"},
                {"object_id": "b", "review_status": "ignored", "category": "ignore"},
            ],
        }

    def test_complete_manifest_is_accepted(self):
        validate_confirmation(self.scenario)

    def test_unreviewed_object_is_rejected(self):
        self.scenario["confirmation"]["reviewed_object_count"] = 1
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


if __name__ == "__main__":
    unittest.main()
