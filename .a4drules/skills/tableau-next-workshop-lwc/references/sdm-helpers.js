/**
 * Tableau Next SDK helpers.
 *
 * LWC does not support shared JS modules across component bundles, so
 * COPY-PASTE these functions into each LWC that talks to the SDK.
 * Keep them at file scope (above the `export default class`).
 *
 * Covers:
 *   - normalizeAggregation(value, allowed)    -> uppercase register-fields enum
 *   - measureSpecFromBinding(binding, allowed)-> bound measure spec
 *   - eventRows(payload)                      -> direct or wrapped event rows
 *   - activeObjectNames(specKeys)             -> exact filter relevance set
 *   - qualifiedModel(object, field)           -> "Object.field"
 *   - isCalculatedField(modelJson, apiName)   -> verified model-level field
 *   - findObjectForFieldApi(modelJson, api)   -> unique owning object apiName
 *   - resolveUserModelString(raw, modelJson)  -> verified qualified/bare model
 *   - normalizeRows(payload, specKeys)        -> keyed row objects
 */

// ---------------------------------------------------------------
// Native binding helpers. Semantic property values are guaranteed objects;
// do not coerce legacy strings into these shapes.
// ---------------------------------------------------------------
function normalizeAggregation(value, allowedAggregations) {
  const key = String(value || '').replace(/[\s_-]/g, '').toLowerCase();
  const values = {
    sum: 'SUM',
    avg: 'AVG',
    average: 'AVG',
    min: 'MIN',
    max: 'MAX',
    median: 'MEDIAN',
    count: 'COUNT',
    countdistinct: 'COUNT_DISTINCT',
    stddev: 'STDDEV',
    var: 'VAR',
    varp: 'VARP',
    useragg: 'USER_AGG'
  };
  const normalized = values[key] || null;
  return Array.isArray(allowedAggregations) &&
    allowedAggregations.includes(normalized)
    ? normalized
    : null;
}

function measureSpecFromBinding(binding, allowedAggregations) {
  if (!binding?.name) throw new Error('A measure binding is required.');
  const spec = { model: binding.name, rowGrouping: false };
  if (!binding.name.includes('.')) return spec;

  const aggregationType = normalizeAggregation(
    binding.aggregation,
    allowedAggregations
  );
  if (!aggregationType) {
    throw new Error(`Unsupported measure aggregation: ${binding.aggregation}`);
  }
  return { ...spec, aggregationType };
}

function eventRows(payload) {
  if (payload && typeof payload === 'object') {
    if (payload.rows !== undefined) return payload.rows;
    if (payload.data !== undefined) return payload.data;
  }
  return payload;
}

function activeObjectNames(specKeys) {
  const names = new Set();
  for (const key of specKeys || []) {
    if (typeof key !== 'string' || !key.includes('.')) continue;
    names.add(key.split('.')[0]);
  }
  return names;
}

// ---------------------------------------------------------------
// 1. Qualified "Object.field" model string
// ---------------------------------------------------------------
function qualifiedModel(objectApi, fieldApi) {
  return `${objectApi}.${fieldApi}`;
}

function isCalculatedField(modelJson, fieldApiName) {
  for (const cm of modelJson?.semanticCalculatedMeasurements || []) {
    if (cm.apiName === fieldApiName) return true;
  }
  for (const cd of modelJson?.semanticCalculatedDimensions || []) {
    if (cd.apiName === fieldApiName) return true;
  }
  for (const metric of modelJson?.semanticMetrics || []) {
    if (metric.apiName === fieldApiName) return true;
  }
  return false;
}

// ---------------------------------------------------------------
// 2. Find which data object owns a given field apiName.
//    Walks semanticDataObjects[].semanticDimensions/semanticMeasurements.
//    Returns null only when the field is a verified model-level field.
//    Throws when a bare field is ambiguous or unknown; prompt-derived roles
//    must never be assigned to an arbitrary first object.
// ---------------------------------------------------------------
function findObjectForFieldApi(modelJson, fieldApiName) {
  const objs = modelJson?.semanticDataObjects || [];
  const matches = [];
  for (const obj of objs) {
    for (const d of obj.semanticDimensions || []) {
      if (d.apiName === fieldApiName) matches.push(obj.apiName);
    }
    for (const m of obj.semanticMeasurements || []) {
      if (m.apiName === fieldApiName) matches.push(obj.apiName);
    }
  }
  if (isCalculatedField(modelJson, fieldApiName)) return null;

  const uniqueMatches = [...new Set(matches)];
  if (uniqueMatches.length === 1) return uniqueMatches[0];
  if (uniqueMatches.length > 1) {
    throw new Error(
      `Field "${fieldApiName}" exists on multiple semantic objects; use Object.field.`
    );
  }
  throw new Error(`Field "${fieldApiName}" was not found in the semantic model.`);
}

// ---------------------------------------------------------------
// 3. Qualify a user-supplied field string against SDM JSON.
//    - "Object.field" -> verified and returned
//    - verified model-level fields -> bare apiName (no Object. prefix)
//    - unique "field" on an object -> "Object.field"
// ---------------------------------------------------------------
function resolveUserModelString(raw, modelJson) {
  const t = (raw || '').trim();
  if (!t) throw new Error('A semantic field is required.');
  if (t.includes('.')) {
    const [objectApi, fieldApi, ...extra] = t.split('.');
    if (!objectApi || !fieldApi || extra.length) {
      throw new Error(`Invalid semantic field "${t}"; expected Object.field.`);
    }
    const object = (modelJson?.semanticDataObjects || []).find(
      (candidate) => candidate.apiName === objectApi
    );
    if (!object) throw new Error(`Semantic object "${objectApi}" was not found.`);
    const exists = [
      ...(object.semanticDimensions || []),
      ...(object.semanticMeasurements || [])
    ].some((field) => field.apiName === fieldApi);
    if (!exists) throw new Error(`Field "${t}" was not found in the semantic model.`);
    return t;
  }
  if (isCalculatedField(modelJson, t)) return t;
  return qualifiedModel(findObjectForFieldApi(modelJson, t), t);
}

// ---------------------------------------------------------------
// 4. Normalize dataUpdate output to { [qualifiedModel]: value } rows.
//
//    dataUpdate can provide rows directly or as { rows } / { data }.
//    The rows themselves can be:
//      a) Objects keyed by qualified "Object.field" -> pass through
//      b) Array-like Proxy tuples -> map by index to specKeys[i]
//      c) Objects keyed by bare field apiName -> re-key from specKeys
//
//    specKeys is the array of spec.model strings used in
//    registerFieldsForQuery, in the same order.
// ---------------------------------------------------------------
function normalizeRows(payload, specKeys) {
  const rows = eventRows(payload);
  if (!rows) return [];
  const keys = Array.isArray(specKeys) ? specKeys : [];
  const bareTails = keys.map((key) =>
    key.includes('.') ? key.split('.').pop() : key
  );

  const out = [];
  const len = typeof rows.length === 'number' ? rows.length : 0;
  for (let i = 0; i < len; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;

    const looksTuple =
      !Array.isArray(row) && typeof row.length === 'number' && row.length > 0;
    if (Array.isArray(row) || looksTuple) {
      const mapped = {};
      for (let j = 0; j < keys.length; j++) mapped[keys[j]] = row[j];
      out.push(mapped);
      continue;
    }

    const hasAllExpectedKeys = keys.every((key) => key in row);
    if (hasAllExpectedKeys) {
      out.push(row);
      continue;
    }

    const mapped = {};
    for (let j = 0; j < keys.length; j++) {
      const bare = bareTails[j];
      mapped[keys[j]] = bare in row ? row[bare] : row[keys[j]];
    }
    out.push(mapped);
  }
  return out;
}
