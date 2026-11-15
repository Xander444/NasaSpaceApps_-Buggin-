# Evidence explorer ergonomic review

Review date: 2026-11-15

This review uses Bastien and Scapin's eight ergonomic criteria as a structured inspection method. It does not replace testing with representative researchers, engineers, or judges.

Primary references:

- Bastien and Scapin, *Ergonomic criteria for the evaluation of human-computer interfaces*, INRIA Technical Report 156 (1993), HAL `inria-00070012`.
- Scapin and Bastien, *Ergonomic criteria for evaluating the ergonomic quality of interactive systems*, Behaviour & Information Technology 16 (1997), DOI `10.1080/014492997119806`.

## Criteria and implemented responses

| Criterion | Interface response |
| --- | --- |
| Guidance | The explorer presents a numbered Search, Review, Compare flow; active search mode and navigation are visible; result counts and service states provide immediate feedback. |
| Workload | The introduction is compact, secondary study filters and conditions are disclosed on demand, source excerpts are collapsed by default, and repeated empty-condition copy is removed. |
| Explicit control | Keyword and SI modes are explicit and mutually visible. SI sends nothing until Analyze. Reset, keyword fallback, comparison close, and SI cancellation/reset actions remain available. |
| Adaptability | Quick examples support first-time users while filters, structured conditions, semantic reranking, SI guidance, and source-level inspection support experienced users. Layout changes from paired results/detail columns to a task-ordered narrow layout. |
| Error management | Unsupported or unavailable services preserve keyword search; invalid conditions remain beside their controls; loading, empty, capacity, and outage states provide a recovery action. Destructive or unavailable actions are disabled. |
| Consistency | Shared control heights, focus treatment, border language, status colors, spacing, headings, and source-link behavior are applied across project, evidence, and simulator surfaces. |
| Significance of codes | Actions use task language such as Keyword search, SI-guided search, Compare selected, Close comparison, and Reset search. Internal service state codes are translated into readable status messages. |
| Compatibility | The primary order matches the research task: ask, refine if needed, review evidence, inspect sources, compare. Touch targets, keyboard focus, readable measures, narrow-screen ordering, and reduced-motion preferences are supported. |

## Remaining human validation

Before submission, ask at least one teammate unfamiliar with the explorer to complete these tasks without coaching:

1. find smoke-detection evidence and open a source;
2. add a required oxygen condition and recover from an invalid value;
3. compare two investigations and close the comparison;
4. switch to SI guidance, verify that Analyze is the transmission point, and return to keyword search; and
5. repeat the first task on a phone-sized viewport using only the keyboard once on desktop.

Record completion failures and confusing labels. Heuristic compliance is not proof that the interface is usable for every intended user.
