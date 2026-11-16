# SI-guided evidence search (Gemini provider)

The existing `/evidence` explorer has explicit **Keyword search** and **SI-guided search** actions. Keyword mode remains local and independent of backend availability. Enter in the ordinary search field exits SI mode. Semantic reranking remains a separate explicit opt-in. Comparison, export eligibility, source details and simulator context are preserved.

The SI panel sends data only after Analyze, Continue, Search with what I have, or Search edited interpretation. It supports focused clarification, selectable/free-text answers, Not sure, editable prior answers and interpretation, Back, Reset, and immediate keyword exit. At most two clarification rounds are permitted. Unknown measurements are never requested merely to fill empty controls. Proposals require a literal user-text span and are applied only through an explicit **Add as preferred condition** action. Existing required filters take precedence. Editing context cancels pending requests and marks previous recommendations stale.

## Local operation

The optional SDK has been installed in the project `.venv`. The current interpreter is Python 3.9, so `requirements-research.txt` pins the compatible official SDK `google-genai==1.47.0`. A newer Python/runtime and SDK can be evaluated independently; the simulator does not import the SDK. The model default is `gemini-3.5-flash-lite`, configurable with backend-only `GEMINI_MODEL`. A live smoke-detector query has now verified this model with the privately configured account; availability remains account-dependent.

Commands for repeatable development:

```sh
npm run research:summaries    # offline, idempotent; zero Gemini calls
npm run research:dev          # .venv API + Vite, loopback, readiness and clean shutdown
npm run research:key          # private local terminal only; hidden key entry
# Explicit rotation:
.venv/bin/python scripts/research_key.py --replace
# Recreate optional dependencies if needed:
.venv/bin/pip install -r requirements-research.txt
```

The key helper refuses noninteractive input and refuses overwriting a saved key without `--replace`. It checks the git ignore rule, preserves unrelated settings, writes atomically with mode 0600, and accepts any nonempty single-line key without imposing a prefix. It asks the operator to confirm eligibility before storing a newly rotated key. No key is collected in chat or a browser. `.env.server.local` is ignored by the existing `*.local` rule and explicitly read by `research/config.py`; Python does not rely on Vite's environment loader. Existing process environment settings take precedence; file-loaded settings refresh on later research requests. The launcher removes all `GEMINI_` variables from the Vite child process.

The app is at `http://127.0.0.1:5173/evidence`. The launcher refuses occupied ports rather than connecting to an unrelated service. Ctrl+C terminates both process groups. Existing `npm run api`, `npm run dev`, static builds, and the optional embedding-service workflow continue to work.

Current [Gemini terms](https://ai.google.dev/gemini-api/terms) require eligible adult developers and restrict the intended audience and regions. See [available regions](https://ai.google.dev/gemini-api/docs/available-regions), [pricing](https://ai.google.dev/gemini-api/docs/pricing), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), and the [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite). The helper does not accept terms, create an account, enable billing, or promise a free quota. No live request is enabled without both a key and `GEMINI_ELIGIBILITY_CONFIRMED=true`.

## Prepared evidence and grounding

`research/summaries.py` produces `public/search/research-summaries.json` from the local index. There is one card for each included investigation (currently 24), with labeled catalog excerpts, source IDs, bounded coverage examples from individual tests, formats, row counts, warnings, and explicit missing-findings language. Each catalog section is capped at 1,000 characters, marked when shortened, and retains a resolvable source ID for its full text. Coverage has at most three examples per field, each retaining its own test and sources. No values from separate tests become a joint operating point. Hardware and test sensor examples describe measurement coverage; file formats are inventory metadata.

The artifact hashes index version, source review, configuration and builder code, plus its card contents. The server checks freshness on startup/status/use; stale artifacts produce a rebuild error, never an evidence-gap result. Summary generation happens only in the explicit command or local launcher, never during Vite dev/build or a research request.

Analyze uses a strict Pydantic JSON schema. A complete request normally takes one intent call and one ranking call. Each clarification step adds one intent call; search-now stops further questions. Edited interpretation can skip the intent call. Retrieval with no candidates skips ranking entirely. Ordinary keyword/semantic controls never trigger Gemini.

For the public container, a localhost-only Node retrieval service loads a committed, version-matched 407 KiB compressed retrieval index and the deterministic search engine once and stays warm. The compact artifact retains all investigation, passage, and test records plus only image/video file metadata; generic file inventory is not scientific evidence and is excluded to keep the combined PyTorch/Node service within the host memory limit. `npm run search:index` regenerates it with the main index, and `npm run research:retrieval-index` can rebuild it independently. The service exposes only `GET /health` and bounded `POST /search`, listens on `127.0.0.1`, accepts no paths or code, and returns at most two supporting records per eligible group. The Python API uses a 30-second internal timeout and verifies the returned index version. Local development retains a fixed one-shot Node subprocess fallback with JSON stdin, fixed arguments, no shell, the same 30-second bound, and sanitized failure categories. The trusted original prompt plus editable goal/data interpretation form the query; explicit controls remain unchanged. The frontend uses that same returned query while SI recommendations are active, and restores the original query in keyword mode. All eligible compact cards and two supporting records per group are sent within a 180,000-character request budget (a conservative approximate 60,000-token budget for this English corpus; actual provider token counts are returned when available). The full index and file inventory are never sent. Oversized payloads fail visibly rather than silently dropping studies.

The model can only rank eligible accession IDs and select exact cited excerpts. The backend rejects duplicates, foreign IDs, citations outside supplied evidence, and text not found both in the supplied excerpt and canonical source. It returns source locators and local limitations instead of free-form scientific claims. The UI labels quotes by source scope, so a hypothesis is not a reported finding. SI ordering changes only order inside verified/related groups, and an explicit non-relevance sort takes precedence. Omitted studies retain engine order and are labeled as not SI-ranked. No SI output changes test export eligibility.

Gap messages distinguish no indexed match, unverified required conditions, and requested measurement coverage not established. They do not claim that research is absent globally. Outages, stale summaries and invalid output are service errors; they preserve keyword results.

## API, privacy and cost controls

Routes on the existing FastAPI app:

- `GET /api/research/status`: provider configuration, evidence versions, and a safe retrieval-health record, never credentials; establishes an HttpOnly same-site session cookie.
- `POST /api/research/analyze`: prompt, up to four answers/two rounds, explicit controls, bounded simulator context, versions and search-now.
- `POST /api/research/recommend`: the same state plus editable intent; candidates are reconstructed on the server.
- `DELETE /api/research/session`: invalidates the session and its cache; does not call a provider.

Pydantic models reject extra fields and bound all user text and arrays. Before parsing, middleware limits bodies to 32 KiB and rejects cross-origin browser requests. The SDK timeout is 25 seconds with one attempt (no automatic retries); output is capped at 4,096 tokens/24,000 characters. Two provider tasks can run concurrently, at most four requests can be in flight, and new work is limited to eight requests/session/minute and twenty/IP/minute. There are no model tools, web access, arbitrary client paths or generated code execution. Provider errors are sanitized into credential/eligibility, quota, model, invalid-output and network/provider categories. Retrieval diagnostics record only mode, error category, status/exit code, and byte counts; they never log questions, source text, credentials, or subprocess stderr.

Validated responses are cached in memory for 15 minutes, at most 128 entries, isolated by opaque session cookie. Keys preserve exact request state, answers, controls, context, index/summary versions, model, generation settings and prompt/schema/engine implementation hashes. Concurrent identical requests share one task. Errors are not cached. Reset clears the old session; a late task cannot repopulate its cache. Refreshing or restarting does not persist conversation text in browser storage or files. Browser cancellation cannot undo a provider call already started.

## Verification and limitations

Run:

```sh
npm run test:research
npm run test:research-bridge
npm run test:research-ui
npm run test:search
.venv/bin/python -m unittest discover -s analysis -p 'test_*.py'
.venv/bin/python -m unittest discover -s simulator -p 'test_*.py'
npm run search:evaluate
npm run build
```

The research tests exercise the real deterministic bridge with mocked provider output, exact cache reuse, session isolation, concurrent coalescing, unknown IDs/citations, no-data shortcuts, body/origin/schema/version limits, service errors, secret storage, reset, and joint-condition checks. The bridge tests start the localhost-only warm service on an ephemeral port, verify its health/version record, run a joint-condition query, and check that invalid conditions fail without internal details. React DOM tests cover chip/answer behavior without implicit calls, clarification submission, keyword exit during a delayed request, stale context, reset, search-now, missing configuration, and a distinct retrieval-outage state. These tests require no live credentials or embedding model.

The initial implementation run passed 25 JavaScript search tests, 17 Python research tests, 5 React DOM tests, 16 analysis tests (one skipped), and 32 simulator tests. Keyword evaluation retained expected top-three matches on all seven existing queries. Production build passes with the existing large simulator-chunk warning. HTTP checks returned 200 for `/evidence`, `/simulator`, `/api/health` and research status. The browser automation host was unavailable, so desktop/mobile visual and keyboard QA remain unverified. Live Gemini analysis, recommendation, citation validation and cache reuse were subsequently verified with the operator-confirmed configuration; see the live test record below. Mocked cache tests establish one provider invocation for repeated and concurrent identical requests; they do not measure real provider latency.

Demo: run a smoke-detector keyword query; open SI guidance and analyze a broad fire-safety question; choose an answer or search-now; inspect source excerpts and existing comparisons; edit a required condition to invalidate recommendations; switch to keyword during a slow request. Repeat an identical completed request to see a cache hit. No inference runs simply by opening the SI panel.

Measured locally, a fresh fixed Node bridge process plus index loading and the smoke-detector search took 432.1 ms and returned 10 candidate groups. This single run is not a latency guarantee; the 15-minute response cache avoids repeating the bridge for identical recommendation requests. The current keyword-only evaluation is saved separately in `docs/research-search-evaluation.json`, preserving the earlier semantic evaluation artifact.


## Live test record — 2026-11-15

The explicitly approved smoke-detector example completed with `gemini-3.5-flash-lite`. Analysis used 344 input / 97 output tokens (2,333 ms); recommendation used 44,564 input / 242 output tokens (2,580 ms). The returned investigations were PSI-101 (SAME-R) and PSI-102 (SAME); every quote was checked against its canonical local source. Repeating the identical recommendation in the same session returned a cache hit with zero new provider calls. These are the successful run's usage counts, not total debugging usage; earlier failed requests did not expose usage through the current error handler.

Live testing found and fixed the SDK's legacy response-schema conversion by passing `response_json_schema`, retaining strict Pydantic validation locally. It also exposed overlong provider excerpts: these are now shortened to a 400-character exact prefix, labeled as shortened, and still checked against the supplied and canonical source text. Unknown IDs, foreign citations and unsupported text remain rejected. The earlier `gemini-2.5-flash-lite` generation request returned model-unavailable despite appearing in the account's model list; the selected current model completed successfully.

`.venv/bin/python scripts/research_smoke.py` explicitly performs this live example and can consume provider quota; it is never part of routine tests. The new schema-serialization and quote-length regression tests run offline. Seventeen research tests, five React UI tests and the production build passed after these fixes. Desktop/mobile visual QA remains unavailable. A separate altered diagnostic request was rejected by automatic approval review and was not executed; the original explicitly approved test completed.
