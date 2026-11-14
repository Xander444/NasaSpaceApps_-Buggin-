import json
import tempfile
import unittest
from pathlib import Path

from analyze import encode, load_records, pairwise_similarity, run, ROOT


class AnalysisTests(unittest.TestCase):
    def setUp(self):
        self.records = load_records(ROOT / "data/investigations.json")

    def test_missing_values_have_zero_mask(self):
        _, mask, names = encode(self.records)
        oxygen_min = names.index("oxygen_percent_min")
        self.assertEqual(mask[:, oxygen_min].sum().item(), 0)

    def test_similarity_is_symmetric(self):
        features, mask, _ = encode(self.records)
        similarity = pairwise_similarity(features, mask)
        self.assertTrue(similarity.allclose(similarity.T))

    def test_export_contains_every_record(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "analysis.json"
            run(ROOT / "data/investigations.json", output)
            payload = json.loads(output.read_text())
            self.assertEqual(payload["record_count"], len(self.records))


if __name__ == "__main__":
    unittest.main()

