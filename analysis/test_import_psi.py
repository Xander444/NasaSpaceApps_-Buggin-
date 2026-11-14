import unittest

from import_psi import DEFAULT_ACCESSIONS, exact_int, exact_number, parse_generic_csv


class ImportTests(unittest.TestCase):
    def test_exact_number_rejects_ambiguous_sequences(self):
        self.assertIsNone(exact_number("5 3 2 ext"))
        self.assertIsNone(exact_number("0.9 then 0.5"))
        self.assertEqual(exact_number("21.0"), 21.0)

    def test_exact_integer_does_not_round(self):
        self.assertEqual(exact_int("57"), 57)
        self.assertIsNone(exact_int("57.5"))

    def test_generic_parser_preserves_raw_cells(self):
        rows = parse_generic_csv(b"Test,Flow\nA1,5 3 2 ext\n", "PSI-X", "test.csv")
        self.assertEqual(rows[0]["raw"]["Flow"], "5 3 2 ext")
        self.assertEqual(rows[0]["source_row"], 2)

    def test_default_catalog_is_unique_and_covers_named_challenge_families(self):
        self.assertEqual(len(DEFAULT_ACCESSIONS), len(set(DEFAULT_ACCESSIONS)))
        for accession in ("PSI-25", "PSI-68", "PSI-102", "PSI-106", "PSI-107", "PSI-159"):
            self.assertIn(accession, DEFAULT_ACCESSIONS)


if __name__ == "__main__":
    unittest.main()
