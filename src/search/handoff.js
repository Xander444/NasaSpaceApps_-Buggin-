export const SIMULATOR_HANDOFF = 'simulator-v1';

const finiteNumber = value => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const setNumber = (params, key, value) => {
  const parsed = finiteNumber(value);
  if (parsed !== null) params.set(key, String(parsed));
};

const parseVector = value => {
  const parts = String(value || '').split(',').map(finiteNumber);
  return parts.length === 3 && parts.every(part => part !== null) ? parts : null;
};

const preferredNumeric = (field, value, unit) => ({
  field,
  value: String(value),
  unit,
  operator: 'eq',
  tolerance: 0,
  mode: 'preferred',
});

const cleanText = (value, maximum = 120) => String(value || '').trim().slice(0, maximum);

const normalizeContextObject = object => {
  if (!object || typeof object !== 'object') return null;
  const id = cleanText(object.id);
  const type = cleanText(object.type, 60);
  if (!id || !type) return null;
  const position = Array.isArray(object.position_m) && object.position_m.length === 3
    && object.position_m.every(value => finiteNumber(value) !== null)
    ? object.position_m.map(Number) : null;
  return {
    id,
    type,
    position_m: position,
    distance_m: finiteNumber(object.distance_m),
    influence_radius_m: finiteNumber(object.influence_radius_m),
    within_modeled_influence: object.within_modeled_influence === true,
  };
};

const parseContextObjects = value => {
  if (!value || value.length > 4000) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.slice(0, 6).map(normalizeContextObject).filter(Boolean) : [];
  } catch {
    return [];
  }
};

/**
 * Build a portable, source-grounded explorer handoff. A vent location is
 * context only unless the scenario supplies a finite physical airflow speed.
 */
export function buildExplorerHandoff({ query, area = '', environment = {}, spot_m, objects = [], vent = null }, basePath = '/evidence') {
  const params = new URLSearchParams();
  params.set('handoff', SIMULATOR_HANDOFF);
  if (String(query || '').trim()) params.set('q', String(query).trim());
  if (cleanText(area, 40)) params.set('area', cleanText(area, 40));
  setNumber(params, 'oxygen_percent', environment.oxygen_percent);
  setNumber(params, 'pressure_kpa', environment.pressure_kpa);
  setNumber(params, 'gravity_g', environment.gravity_g);
  setNumber(params, 'ambient_temperature_c', environment.ambient_temperature_c);
  if (Array.isArray(spot_m) && spot_m.length === 3 && spot_m.every(value => finiteNumber(value) !== null)) {
    params.set('spot_m', spot_m.map(Number).join(','));
  }
  const contextObjects = (Array.isArray(objects) ? objects : []).slice(0, 6).map(normalizeContextObject).filter(Boolean);
  if (contextObjects.length) params.set('objects', JSON.stringify(contextObjects));
  if (vent) {
    if (vent.id) params.set('vent_id', vent.id);
    if (Array.isArray(vent.position_m) && vent.position_m.length === 3 && vent.position_m.every(value => finiteNumber(value) !== null)) {
      params.set('vent_position_m', vent.position_m.map(Number).join(','));
    }
    const airflowSpeed = finiteNumber(vent.airflow_speed_m_s);
    params.set('airflow_speed_m_s', airflowSpeed === null ? 'unknown' : String(airflowSpeed));
  }
  return `${basePath}?${params.toString()}`;
}

export function parseExplorerHandoff(search) {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  if (params.get('handoff') !== SIMULATOR_HANDOFF) return null;

  const oxygen = finiteNumber(params.get('oxygen_percent'));
  const pressure = finiteNumber(params.get('pressure_kpa'));
  const gravity = finiteNumber(params.get('gravity_g'));
  const temperature = finiteNumber(params.get('ambient_temperature_c'));
  const airflowRaw = params.get('airflow_speed_m_s');
  const airflow = airflowRaw === 'unknown' || airflowRaw === null ? null : finiteNumber(airflowRaw);
  const conditions = [];

  // These are preferred rather than required: they are design context to rank
  // relevant evidence, not a claim that every record reports these conditions.
  if (oxygen !== null && oxygen >= 0 && oxygen <= 100) conditions.push(preferredNumeric('oxygen_initial_percent', oxygen, '% vol'));
  if (pressure !== null && pressure >= 0) conditions.push(preferredNumeric('pressure', pressure, 'kPa'));
  if (airflow !== null && airflow >= 0) conditions.push(preferredNumeric('airflow', airflow, 'm/s'));

  const ventId = params.get('vent_id') || null;
  return {
    query: params.get('q') || '',
    conditions,
    context: {
      oxygen_percent: oxygen,
      pressure_kpa: pressure,
      gravity_g: gravity,
      ambient_temperature_c: temperature,
      spot_m: parseVector(params.get('spot_m')),
      area: cleanText(params.get('area'), 40) || null,
      objects: parseContextObjects(params.get('objects')),
      vent_id: ventId,
      vent_position_m: parseVector(params.get('vent_position_m')),
      airflow_speed_m_s: airflow,
      airflow_speed_status: ventId && airflow === null ? 'unknown' : airflow !== null ? 'known' : 'not provided',
    },
  };
}
