# Data team contract

The data pipeline must preserve source facts separately from parsed or modeled values.

## Required principles

- One normalized row represents one test or burn, not an entire investigation.
- Every row must have an investigation accession, test/sample identifier, source file, and source row/page/timestamp.
- Preserve the original cell as `*_raw` whenever parsing is lossy or ambiguous.
- Use `null` for missing values. Never use zero as a missing-data placeholder.
- Store units in the field name or a companion unit field.
- Record whether a value is reported, parsed, calculated, interpolated, or modeled.
- Do not convert fan display values into flow speed without a documented calibration source.
- Keep ingestion reproducible: source filename, source version, byte count, and SHA-256.

## Current outputs

- `data/psi/catalog.json`: investigation summaries from the public NASA PSI API.
- `data/psi/file_inventory.json`: public file names, categories, sizes, and versions.
- `data/psi/tables/`: downloaded public experimental tables.
- `data/psi/normalized/bass_ii_tests.json`: normalized BASS-II rows.
- `data/psi/manifest.json`: import time, hashes, counts, and failures.

## Pull request checklist

- [ ] New source is an official NASA or peer-reviewed primary source.
- [ ] Source accession/DOI is recorded.
- [ ] Units are explicit.
- [ ] Missing values remain null.
- [ ] Ambiguous values preserve raw text.
- [ ] At least five representative rows were manually checked.
- [ ] No model coefficient is presented as a measured NASA value.
