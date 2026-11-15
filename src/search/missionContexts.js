export const MISSION_CONTEXTS = [
  {
    id: 'spacesuit',
    label: 'Spacesuit reference',
    summary: '100% O₂ · 4.3 psi (29.6 kPa)',
    conditions: [
      {field: 'oxygen_initial_percent', value: '100', unit: '% vol', operator: 'eq', tolerance: 0},
      {field: 'pressure', value: '29.6', unit: 'kPa', operator: 'eq', tolerance: 0},
    ],
  },
  {
    id: 'lunar-habitat',
    label: 'Lunar habitat planning envelope',
    summary: '≥30% O₂ · ≤10.2 psi (≤70.3 kPa)',
    conditions: [
      {field: 'oxygen_initial_percent', value: '30', unit: '% vol', operator: 'gte', tolerance: 0},
      {field: 'pressure', value: '70.3', unit: 'kPa', operator: 'lte', tolerance: 0},
    ],
  },
];

export function preferredConditionsForContext(contextId) {
  const context = MISSION_CONTEXTS.find(item => item.id === contextId);
  if (!context) throw new RangeError(`Unknown mission context: ${contextId}`);
  return context.conditions.map(condition => ({...condition, mode: 'preferred'}));
}

export function countComparableTestRows(groups, conditions) {
  const preferredCount = conditions.filter(condition => condition.mode === 'preferred').length;
  if (!preferredCount) return 0;

  return groups.flatMap(group => group.tests || []).filter(test => {
    const preferredChecks = (test.checks || []).filter(check => check.mode === 'preferred');
    return preferredChecks.length === preferredCount && preferredChecks.every(check => check.status === 'matched');
  }).length;
}