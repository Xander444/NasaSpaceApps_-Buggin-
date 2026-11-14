# Evidence search and comparison (schema 1)

The `/` explorer uses the committed `public/search/index.json`. `npm run dev` and `npm run build` need no Python server, model, API key, or NASA access. The `/simulator` route, annotation gate, coefficients, and API contract are preserved.

## Commands

```bash
npm install
npm run dev
npm run build
# Rebuild only when source inputs or preprocessing change; standard-library Python 3.9+:
npm run search:index
npm run test:search
python3 -m unittest discover -s analysis -p 'test_*.py'
npm run search:evaluate
```

Existing analysis tests also need the project's regular Python requirements. Index generation itself is standard-library-only. `npm run build` never reimports PSI or rebuilds the index. `npm run import:psi` remains an explicit, separate network operation.

## Optional semantic search

Use a project virtual environment (tested on Python 3.9/macOS ARM64; pinned packages support Python 3.9–3.12):

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-semantic.txt
python analysis/semantic_service.py --check  # downloads pinned model on first run
python analysis/semantic_service.py         # loopback port 8765
# Subsequent offline starts:
python analysis/semantic_service.py --offline
```

Set `VITE_SEMANTIC_URL=http://127.0.0.1:8765` in `.env.local` (see `.env.example`), restart Vite, then enable **Optional semantic search**. Nothing starts or downloads automatically in the dashboard. The optional service is separate from the simulator API. Both optional and regular Python requirements can coexist in the same environment.

```bash
SEMANTIC_URL=http://127.0.0.1:8765 npm run search:evaluate
```

The model is [`sentence-transformers/all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), Apache-2.0, pinned to revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`. Runtime pins: Sentence Transformers 3.4.1, Transformers 4.48.3, PyTorch 2.6.0, NumPy 2.0.2. The model card describes semantic search use. The [official encoding/revision API](https://www.sbert.net/docs/package_reference/sentence_transformer/model.html) was checked during implementation. This symmetric MiniLM uses the same normalized `encode` method for questions and evidence, without artificial instruction prefixes; no training occurs.

The model loads once. Catalog and test texts are encoded once per content/model version and cached under ignored `.cache/search/`. Actual tokenizer chunks are limited to 220 wordpieces (below the model's 256-token limit); repeated text is encoded once. Test IDs, dates, PI names, camera identifiers, and other row identifiers are excluded from semantic text. File inventory records are not embedded. Multiple chunks map to stable document IDs using maximum cosine similarity, never summed similarity. Source embeddings are retained across requests; each new query gets one encoding. A lock serializes model inference.

`POST /search` accepts exactly `{query, index_version}` with 1–750 trimmed query characters and at most 8 KiB JSON. It returns `{index_version, model_version, scores: [{id, score}]}` for the fixed local index; no URL, path, or model selector is accepted. A version mismatch returns 409, unavailable models 503, bad input 400/413. `/health` exposes readiness and versions. CORS allows only explicit localhost/127.0.0.1 development origins, default port 5173. For a different Vite port, set `SEMANTIC_ALLOWED_ORIGINS=http://127.0.0.1:5174,http://localhost:5174`. The service binds only `127.0.0.1`.

The UI debounces 300 ms, aborts stale requests, ignores outdated responses, and times out after 5 seconds. Keyword results remain usable while waiting and on every failure. Index mismatch and errors are visible. Related-data modes currently use the deterministic keyword/condition engine and explicitly show keyword mode.

## Data scope and provenance

The integrated catalog at upstream commit `c81ba38` contains 24 investigations. The index includes 1,870 identifiable test/session rows, 379 catalog/table-summary passages, and 16,354 unrestricted file-metadata records. The 22 imported CSVs contain 2,870 raw rows after recovering both tables for PSI-10 and PSI-159. Of these, 861 completely empty PSI-159 rows are excluded from search, while 139 non-test/summary rows remain passages with unresolved scope. No publication full-text corpus has been downloaded. Inventory matches say **file metadata only**; restricted entries are omitted entirely.

The importer previously overwrote the first normalized table when an investigation had a second table. It now accumulates all tables per accession. Two existing source CSVs restored 386 omitted rows without contacting NASA. Table-qualified IDs distinguish the normal/inverse flame records; missing fuel fields and batch summaries are not turned into individual matched test conditions. Source-review inclusion/exclusion decisions from `data/source_review.json` are preserved and included in the index hash.

For smoother static loading, the builder also writes deterministic `index.json.gz` (about 1.5 MB, versus 23.9 MB of JSON). The browser streams decompression locally and falls back to ordinary JSON when unavailable. No hosting configuration or runtime server is needed.

Inputs are the committed catalog, file inventory, manifest, normalized tables, and source CSVs. CSV hashes are checked against the import manifest. BASS-II normalized values are checked against raw source cells; mismatches stop the build. The first/source-representative rows inspected include BASS-II B1/B2 (22.2 initial versus 1.6 final in B2), BASS as-run tests 1/2, FLEX 1/2 (native mmHg and mole fractions), SAME-R 51/51a, SAME 1/6 (missing fields), and Saffire S1/S2 plus table notes.

Every source has accession, DOI where present, NASA URL, field/file, source version and SHA-256, row/passage locator, extraction status, and exact normalized excerpt/cells. Each structured value stores `value`, `unit`, `raw`, `method`, and `source_ids`. Catalog hypotheses and prospective impacts keep their own section labels; they are never promoted to findings. Summaries are extracts, not generated scientific conclusions. File links point to the NASA investigation landing page, not an unverified downloadable asset.

Index version is a content hash of source hashes, schema, annotations/configuration, and builder code. Unchanged builds have identical bytes and IDs. Passage IDs use content hashes; test IDs use accession and source test/as-run identifier (a row suffix disambiguates duplicates); file IDs hash the name. All source data consumers and simulator contracts remain unchanged. `data/search/legacy_annotations.json` preserves prior curator copy separately, explicitly unverified and excluded from ranking/constraints. It is not used as scientific fact.

Coverage is conservative:

- BASS-II has separately parsed initial/final oxygen in percent by volume and initial/final CO in ppm. B1's 22.2% conflicts with the catalog's below-21% description; both remain visible. Negative CO and oxygen above 30% are flagged as suspicious, not corrected or discarded.
- Fan display sequences remain uncalibrated settings. No velocity inference occurs.
- Materials are preserved as reported. Fuel class is a documented rule based on named materials; it is not material equivalence. Ambiguous materials remain unclassified.
- FLEX pressure remains mmHg. Its initial oxygen remains a separate mole-fraction field, never silently treated as percent-by-volume oxygen. Extinction diameter and test outcomes remain in raw cells.
- Explicit airflow cells in the other tables are parsed only when exact numbers with supported units; approximate/range oxygen is not treated as initial oxygen.
- Per-test gravity remains unresolved. ISS affiliation is not inherited as measured microgravity. Saffire-II rows explicitly retain mixed reduced/normal-gravity outcome scope. PSI-62 retains the catalog's Ground Investigation classification and modeling approach. No measured lunar/Martian applicability is certified.
- Project dates, raw test dates, and repository modified dates are separate. Publication dates are absent, so publication sorting is hidden. No repository date is substituted.

## Ranking and filters

`src/search/engine.js` is pure JavaScript. Field-aware BM25 uses `k1=1.2`, `b=0.75`; title/text/tag weights are 3/1/2. To avoid file-count/long-study bias, document frequency counts investigations containing a term, with maximum content length per investigation as the length-normalization reference. Inventory metadata does not alter corpus statistics. A group uses its best supporting document, never the sum of its files or chunks. All ties resolve to stable IDs.

Tokens are precomputed during index generation. Aliases and regex tag rules live in `data/search/config.json`: PMMA/acrylic/polymethyl methacrylate; CO₂/carbon dioxide; O₂/oxygen; detector/detection/alarm; extinction/extinguish/suppression; singular/plural flame/fuel, images, cameras, and related supported forms. Specific original terms remain in source text. Rule tags retain method and source citations. URLs and accession prefixes are excluded from general title matching; exact accession/test IDs and program acronyms get explicit handling. This is a controlled tokenizer, not a general language parser.

A positive lexical match admits a candidate; semantic-only matches need cosine ≥0.42. That threshold is a heuristic, not scientific confidence. Empty, unfiltered searches are labeled browse and ordered neutrally by program. Completely unrelated text can return no matches. Short generic words can still return broad results: inspection of source passages and optional required filters is necessary. No expected evaluation IDs or fixed mission ranks appear in the engine.

Each investigation contributes once to each keyword/semantic ranking within each verified/related group. Hybrid ranking uses reciprocal-rank fusion `1/(60+keywordRank) + 1/(60+semanticRank)`, not raw BM25 plus cosine. Preferred matches add 0.003 each; unknown requested fields get zero credit. Conditions not requested contribute nothing. Condition matching and grouping are identical in keyword/hybrid mode. Parent passage relevance can admit a test contextually at a discounted lexical score (0.35); the UI cites that context, and no experimental condition is inherited from it.

Required material, gravity, initial oxygen, pressure, airflow, direction, geometry, and sensor constraints must all match one test row. Any differing/unknown condition sends that row to **Related evidence with gaps**, excluded from exact counts and exports. Missing unknown fields are not measured zero. Equality has explicitly displayed zero tolerance by default, editable by the user; inequality/range operators do not apply a hidden tolerance. Recognized numbers/comparative wording in questions are never hard filters and trigger an explanatory notice. Negated phrases are removed from positive keyword/semantic text; matching the full negated phrase reduces lexical relevance. Complex natural-language negation is limited; explicit “Does not contain” conditions are available.

Pressure controls use the documented conventional relation `1 atm = 101.325 kPa = 760 mmHg`; airflow uses `1 m/s = 100 cm/s` ([NIST SI conversion reference](https://www.nist.gov/pml/special-publication-811)). No mole/volume or fan-display conversions occur. Raw values and units remain in exports.

Problem/outcome controls use source-backed topical tags at investigation scope. Data-needed controls distinguish test measurements, indexed approach passages, reported outcomes/findings, and image/video references (which may be inventory-only). These controls do not assert that a publication was read or that every test shares the parent topic/conditions.

The cache is bounded to 40 entries. Its canonical key includes normalized query, every filter/operator/tolerance/priority, related-data seed/mode, sorting, index version, ranking configuration, and full semantic scores/model version. Data loading and engine construction occur once per index; React memoization is only a rendering aid.

## Compare, related data, export

Select up to three investigations or actual test rows. Search changes preserve selections and mark items outside the current results. Compare shows exact scope, cited objectives/hardware/approaches for investigation selections, matching/differing/missing test fields, discrepancies, supported descriptive statements, conversion conventions, and concrete limitations. Unknown versus unknown never counts as a match. Differences do not establish causation. Investigation coverage cannot combine separate tests into simultaneous conditions.

**Find similar data** offers topic, experimental-condition, and measurements/sensors modes. It excludes the seed (the entire investigation when the seed is an investigation), preserves required filters, cites the supporting evidence, and shows condition differences/gaps. Condition mode requires a seed test with normalized fields; missing fields earn no credit. Topic/measurement links are contextual and do not establish direct experimental compatibility. The older `analysis/analyze.py` cosine output is not reused: its categorical observability mask does not support these scoped requirements.

JSON/CSV exports include only selected test rows that remain verified in the current search. JSON includes comparison evidence and resolvable sources; CSV contains one field per row with units, raw text, method, source IDs/locators/URLs, and warnings. Missing values serialize as JSON null or the explicit CSV string `null`. CSV quoting covers commas, quotes, and newlines, and leading formula characters are neutralized. Related rows, files, and investigation selections are excluded from test exports.

## Demo

1. Search **Design a smoke detector**. Inspect SAME and SAME-R objectives/approaches; open the citation excerpts and supporting rows.
2. Reset. Search **PMMA**. Add required Material = PMMA and required Initial oxygen = 22.2 `% vol`, tolerance 0. Inspect **PSI-25:B1**, its CSV row 2 citation, and the catalog discrepancy.
3. Select B1 and B2 test rows. Open Compare. Initial oxygen matches, final oxygen differs, and measured gravity/velocity remain unknown. Export JSON/CSV.
4. Add required measured gravity = lunar. Exact matches disappear; related evidence displays the gaps. Previous selections remain visible and cannot be exported as verified matches.
5. With the service configured, enable semantic search; stop it or change the index version to see a nonblocking keyword fallback.

Illustrative shape only — **not source evidence**:

```json
{
  "id": "PSI-EXAMPLE:TEST-A",
  "accession": "PSI-EXAMPLE",
  "kind": "test",
  "conditions": {
    "oxygen_initial_percent": {
      "value": null,
      "unit": "% vol",
      "raw": null,
      "method": "unreported",
      "source_ids": ["illustrative-source-id"]
    }
  }
}
```

## Evaluation and verification

`data/search/evaluation.json` records 3 tuning questions and 4 distinct held-out questions with source-based rationales. The engine never loads the evaluation labels. `docs/search-evaluation.json` records exact top-three rankings, real model version, errors, and timings for the last evaluation. These are retrieval judgments on a small corpus, not proof of scientific correctness or generalization.

Measured after integration on the actual 18,627-document index on macOS/Node 24.22.0: initialization **36.792 ms**, uncached keyword searches **28.739–43.693 ms**, and cached repeats **0.027–0.034 ms**. These single-run timings exclude transfer, decompression and rendering; they are not latency guarantees.

| Query | Keyword top three | Real hybrid top three |
| --- | --- | --- |
| Design a smoke detector | PSI-102, PSI-115, PSI-101 | PSI-102, PSI-101, PSI-115 |
| Extinguish liquid-fuel flames | PSI-69, PSI-26, PSI-68 | PSI-69, PSI-26, PSI-68 |
| PMMA initial oxygen | PSI-25, PSI-99, PSI-26 | PSI-25, PSI-26, PSI-99 |
| alarms for spacecraft smoke | PSI-102, PSI-115, PSI-101 | PSI-102, PSI-101, PSI-47 |
| liquid droplet extinction | PSI-39, PSI-69, PSI-68 | PSI-69, PSI-68, PSI-39 |
| large scale fabric fire growth | PSI-100, PSI-98, PSI-99 | PSI-100, PSI-26, PSI-98 |
| quantum banana investment | No matches | No matches |

All expected tuning targets and keyword held-out targets remained in the top three after catalog expansion. Hybrid still retrieves only two of three expected Saffire studies for the fabric-growth question; it does not demonstrate universal superiority. Additional modeling/detector studies can appear as topical context, and structured required filters remain necessary for exact compatibility. Evaluation labels were not changed to accommodate new rankings.

Integrated checks: 16 JavaScript tests, 16 analysis Python tests (including multi-table import and compressed artifact coverage), 10 simulator Python tests, dependency compatibility, production build, and `git diff --check`. The real pinned model was exercised against the expanded index. Existing browser visual/interaction verification remains unavailable; builds and unit/service checks do not replace it.

The automated checks cover joint constraints with synthetic fixtures, initial/final separation, zero/null, raw fan settings, conversions/operators/tolerances, missing gravity, aliases/negation/IDs, unrelated queries and browse, duplicate-volume stability, date sorting, citations, hypothesis labels, similar-data filters, cache keys, scoped export/CSV injection, and semantic failure/version/timeout/CORS behavior.

The real pinned model was downloaded and exercised; hybrid evaluation uses actual service scores, not mocks. Browser interaction and desktop/narrow visual QA could not run because the computer-use browser host was unavailable. Local HTTP checks for `/` and `/simulator` returned 200; this is route verification only. The production build retains the pre-existing large simulator chunk warning. No simulator coefficient or workflow was changed.
