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

class MultiTableImportTests(unittest.TestCase):
    def test_all_tables_survive_per_accession(self):
        import json
        import tempfile
        from pathlib import Path
        from unittest.mock import Mock, patch
        from import_psi import import_all
        response=Mock()
        response.json.return_value={'accession':'PSI-X','experimentalTable':[{'file_name':'one.csv'},{'file_name':'two.csv'}]}
        session=Mock();session.headers={};session.get.return_value=response
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            with patch('import_psi.ROOT',root), patch('import_psi.requests.Session',return_value=session), patch('import_psi.download_public_file',side_effect=[b'Test,Fuel\nA,PMMA\n',b'Test,Fuel\nB,wax\n']):
                result=import_all(['PSI-X'],root/'data')
            self.assertEqual(result['errors'],[])
            rows=json.loads((root/'data/normalized/psi-x_table_rows_raw.json').read_text())
            self.assertEqual([r['source_file'] for r in rows],['one.csv','two.csv'])
