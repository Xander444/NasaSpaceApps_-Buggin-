import {FIELDS} from './conditions.js';

const DISPLAY_FIELDS = [
  'material', 'fuel_class', 'oxygen_initial_percent', 'oxygen_final_percent',
  'pressure', 'airflow', 'direction', 'geometry', 'gravity', 'sensor', 'outcome', 'fan_display',
];
const CATALOG_SECTIONS = new Set(['objective', 'approach', 'hardware', 'title']);
const unique = values => [...new Set(values.filter(Boolean))];
const displayValue = field => FIELDS[field]?.label || ({
  oxygen_final_percent: 'Final oxygen',
  outcome: 'Reported outcome',
  fan_display: 'Fan setting',
}[field] || field.replaceAll('_', ' '));

function groupSourceIds(group) {
  const supported = (group.evidence || []).filter(item => item.doc.kind === 'test' || CATALOG_SECTIONS.has(item.doc.section));
  return unique((supported.length ? supported : group.evidence || []).flatMap(item => item.doc.source_ids || []));
}

function relevantTestRows(groups) {
  const groupedRows = groups.map(group => (group.tests || []).map(item => ({
        doc: item.doc,
        checks: item.checks || [],
        rank: item.rank || 0,
        investigation: group.investigation,
      })).sort((a, b) => b.rank - a.rank || a.doc.id.localeCompare(b.doc.id)));
  const rows = [];
  for (let offset = 0; groupedRows.some(group => offset < group.length); offset++) {
    for (const group of groupedRows) if (group[offset]) rows.push(group[offset]);
  }
  return rows;
}

function coverageSummary(rows, conditions) {
  if (!conditions.length) return null;
  const matched = rows.find(row => row.checks.length === conditions.length && row.checks.every(check => check.status === 'matched'));
  if (matched) return {kind: 'matched', text: 'At least one test row in these results matches every requested condition. This indicates comparability on those fields only—not safety, causation, or equivalence.'};

  const checks = rows.flatMap(row => row.checks);
  const unknownFields = unique(checks.filter(check => check.status === 'unknown').map(check => displayValue(check.field)));
  const differingFields = unique(checks.filter(check => check.status === 'different').map(check => displayValue(check.field)));
  return {
    kind: rows.length ? 'gap' : 'no-tests',
    text: rows.length
      ? `No test row in the current results matches all requested conditions together.${unknownFields.length ? ` Values are unknown for ${unknownFields.join(', ')}.` : ''}${differingFields.length ? ` Reported values differ for ${differingFields.join(', ')}.` : ''} Unknowns are not matches; conditions from different rows are never combined.`
      : 'The current results contain no indexed test rows to check against these conditions. This does not establish that the research is absent from NASA PSI.',
  };
}

/** Build deterministic, source-bounded insight content from current search results. */
export function buildScientificInsight({query = '', result, conditions = [], maxGroups = 3, maxEvidenceRows = 5} = {}) {
  const cleanQuery = String(query || '').trim();
  const requested = Array.isArray(conditions) ? conditions.filter(condition => String(condition.value ?? '').trim()) : [];
  if (!cleanQuery && requested.length === 0) return null;
  if (!result || result.browse) return null;

  const groups = [...(result.verified || []), ...(result.related || [])];
  const selectedGroups = groups.slice(0, maxGroups);
  const allRows = relevantTestRows(selectedGroups);
  const rows = allRows.slice(0, maxEvidenceRows);
  const sourceIds = unique(selectedGroups.flatMap(groupSourceIds));
  const noMatches = groups.length === 0;
  const inputErrors = result.errors || [];
  const summary = noMatches
    ? inputErrors.length
      ? 'Insight is unavailable until the search conditions are corrected.'
      : cleanQuery
      ? `No indexed investigation matched “${cleanQuery}” in the current search. This is a limit of the current index and query, not evidence that NASA has never studied the topic.`
      : 'No investigation in the current search matched the requested conditions.'
    : `The current search returned ${selectedGroups.map(group => group.investigation.program).join(', ')}${groups.length > selectedGroups.length ? `, and ${groups.length - selectedGroups.length} more investigation(s)` : ''}. These are topic-relevant catalog records; test measurements and conditions must be checked at the individual-row level.`;

  const observations = rows.flatMap(row => {
    const known = DISPLAY_FIELDS.filter(field => {
      const value = row.doc.conditions?.[field]?.value;
      const method = row.doc.conditions?.[field]?.method;
      return value !== null && value !== undefined && value !== '' && ['reported', 'parsed'].includes(method);
    });
    return known.length ? [{row, fields: known}] : [];
  });

  const varyingFields = DISPLAY_FIELDS.filter(field => {
    const values = unique(rows.map(row => {
      const value = row.doc.conditions?.[field]?.value;
      return value === null || value === undefined || value === '' ? null : `${value} ${row.doc.conditions[field].unit || ''}`.trim();
    }).filter(Boolean));
    return values.length > 1;
  });
  const missingRequestedFields = unique(rows.flatMap(row => row.checks.filter(check => check.status === 'unknown').map(check => displayValue(check.field))));
  const warnings = unique(rows.flatMap(row => row.doc.warnings || []));
  const gravityUnknownRows = allRows.filter(row => row.doc.conditions?.gravity?.value === null || row.doc.conditions?.gravity?.value === undefined);
  const uncalibratedFanRows = allRows.filter(row => {
    const fan = row.doc.conditions?.fan_display?.value;
    const airflow = row.doc.conditions?.airflow?.value;
    return fan !== null && fan !== undefined && fan !== '' && (airflow === null || airflow === undefined || airflow === '');
  });
  const conditionCoverage = coverageSummary(allRows, requested);
  const gaps = conditionCoverage;

  return {
    query: cleanQuery,
    sourceIds,
    summary,
    noMatches,
    inputErrors,
    evidenceRows: rows,
    observations,
    interpretation: noMatches
      ? 'No scientific interpretation is generated because the current search did not retrieve a supporting indexed record.'
      : conditionCoverage?.kind === 'matched'
        ? 'At least one individual test row reports values matching every requested condition, so the results can be compared on those fields at that row’s scope. This does not establish material safety, a causal effect, or performance in an untested environment.'
        : conditionCoverage
          ? 'No single test row in the current results reports every requested condition together, so these records cannot support a like-for-like comparison for the full scenario. Values from separate tests are not combined.'
          : 'The retrieved test rows document conditions or outcomes, but this search did not specify a joint condition set. These records do not by themselves establish a causal effect or safe operating condition.',
    relevance: noMatches
      ? 'No source-backed relevance statement is available from the current results.'
      : rows.length
        ? 'Topical relevance comes from the indexed catalog text and the test rows shown here. Check each row’s conditions and source scope before applying it to a mission design.'
        : 'The retrieved catalog descriptions provide research context, but no test row was retrieved to verify experimental measurements for this question.',
    gaps: [
      ...(inputErrors.length ? [{kind: 'input', text: `Correct the search condition(s) before interpreting evidence: ${unique(inputErrors).join('; ')}.`}] : []),
      ...(gaps ? [gaps] : []),
      ...(missingRequestedFields.length ? [{kind: 'unknown', text: `Requested values remain unknown in at least one current test record: ${missingRequestedFields.join(', ')}.`, sourceIds: unique(allRows.flatMap(row=>row.checks.filter(check=>check.status==='unknown').flatMap(check=>check.source_ids||[])))}] : []),
      ...(gravityUnknownRows.length ? [{kind: 'unknown', text: 'Measured gravity is unresolved at the individual test-row scope in the displayed evidence; ISS or investigation-level context is not treated as a measurement.', sourceIds: unique(gravityUnknownRows.flatMap(row=>row.doc.conditions.gravity?.source_ids||row.doc.source_ids||[]))}] : []),
      ...(uncalibratedFanRows.length ? [{kind: 'unknown', text: 'Some rows report fan-display settings but no calibrated airflow velocity. These display values are not converted into physical flow speeds.', sourceIds: unique(uncalibratedFanRows.flatMap(row=>[...(row.doc.conditions.fan_display?.source_ids||[]),...(row.doc.source_ids||[])]))}] : []),
      ...(varyingFields.length > 0 && allRows.length > 1 ? [{kind: 'different', text: `The selected rows report different ${varyingFields.map(displayValue).join(', ')}. These differences do not isolate cause and effect.`, sourceIds: unique(allRows.flatMap(row=>row.doc.source_ids||[]))}] : []),
      ...(warnings.length ? [{kind: 'warning', text: `Source/index warnings: ${warnings.join(' ')}.`, sourceIds: unique(allRows.filter(row=>(row.doc.warnings||[]).length).flatMap(row=>row.doc.source_ids||[]))}] : []),
      {kind: 'scope', text: 'The current index contains NASA catalog excerpts and selected table cells; file-inventory entries are metadata only. Absence from these indexed records is not proof of global absence.', sourceIds},
    ],
  };
}

export function evidenceFieldValue(document, field) {
  const condition = document.conditions?.[field];
  if (!condition || condition.value === null || condition.value === undefined || condition.value === '') return 'Unknown';
  const value = condition.raw ?? condition.value;
  return `${value}${condition.unit ? ` ${condition.unit}` : ''}`;
}

export function evidenceFieldSourceIds(document, field) {
  return document.conditions?.[field]?.source_ids || document.source_ids || [];
}

export {DISPLAY_FIELDS, displayValue};
