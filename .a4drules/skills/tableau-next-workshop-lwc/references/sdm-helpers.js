/**
 * Tableau Next SDK helpers.
 *
 * LWC does not support shared JS modules across component bundles, so
 * COPY-PASTE these functions into each LWC that talks to the SDK.
 * Keep them at file scope (above the `export default class`).
 *
 * Covers:
 *   - normalizeAggregation(value)             -> register-fields enum
 *   - measureSpecFromBinding(binding)         -> bound measure spec
 *   - bindingSignature(source, specs, limit)  -> stable rebind key
 *   - activeObjectNames(specKeys)             -> exact filter relevance set
 *   - qualifiedModel(object, field)          -> "Object.field"
 *   - isCalculatedField(modelJson, apiName)   -> verified model-level field
 *   - findObjectForFieldApi(modelJson, api)   -> unique owning object apiName
 *   - resolveUserModelString(raw, modelJson)  -> verified qualified/bare model
 *   - normalizeRows(rows, specKeys)          -> keyed row objects
 */

// ---------------------------------------------------------------
// Native binding helpers. Semantic property values are guaranteed objects;
// do not coerce legacy strings into these shapes.
// ---------------------------------------------------------------
function normalizeAggregation(value) {
  const key = String(value || '').replace(/[\s_-]/g, '').toLowerCase();
  const values = {
    sum: 'Sum',
    avg: 'Average',
    average: 'Average',
    min: 'Min',
    max: 'Max',
    median: 'Median',
    count: 'Count',
    countdistinct: 'CountDistinct',
    stddev: 'StdDev',
    var: 'Var',
    varp: 'VarP',
    useragg: 'UserAgg'
  };
  return values[key] || null;
}

function measureSpecFromBinding(binding) {
  if (!binding?.name) throw new Error('A measure binding is required.');
  const spec = { model: binding.name, rowGrouping: false };
  if (!binding.name.includes('.')) return spec;

  const aggregationType = normalizeAggregation(binding.aggregation);
  if (!aggregationType) {
    throw new Error(`Unsupported measure aggregation: ${binding.aggregation}`);
  }
  return { ...spec, aggregationType };
}

function bindingSignature(sourceName, specs, limit) {
  return JSON.stringify({ sourceName, specs, limit });
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
//    Returns null when the field is a verified model-level field.
//    Throws when a bare field is ambiguous or unknown; prompt-derived roles
//    must never be assigned to an arbitrary first object.
// ---------------------------------------------------------------
function findObjectForFieldApi(modelJson, fieldApiName) {
  const objs = modelJson?.semanticDataObjects || [];
  const matches = [];
  for (const obj of objs) {
    for (const d of obj.semanticDimensions || []) {
      if (d.apiName === fieldApiName) {
        matches.push(obj.apiName);
      }
    }
    for (const m of obj.semanticMeasurements || []) {
      if (m.apiName === fieldApiName) {
        matches.push(obj.apiName);
      }
    }
  }
  if (isCalculatedField(modelJson, fieldApiName)) {
    return null;
  }
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
//    - top-level calcs / *_clc / *_mtc -> bare apiName (no Object. prefix)
//    - unique "field" on an object -> "Object.field"
// ---------------------------------------------------------------
function resolveUserModelString(raw, modelJson) {
  const t = (raw || '').trim();
  if (!t) return '';
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
  if (isCalculatedField(modelJson, t)) {
    return t;
  }
  const obj = findObjectForFieldApi(modelJson, t);
  return qualifiedModel(obj, t);
}

// ---------------------------------------------------------------
// 4. Normalize dataUpdate output to { [qualifiedModel]: value } rows.
//
//    The SDK returns rows in one of three shapes:
//      a) Array of objects keyed by qualified "Object.field"  -> pass through
//      b) Array-like Proxy rows (tuples): Array.isArray is FALSE, but
//         row.length is numeric and row[i] is indexable. Map by index
//         to specKeys[i].
//      c) Array of objects keyed by BARE field apiName. Re-key to
//         qualified using the tail of each specKey.
//
//    specKeys is the array of spec.model strings used in
//    registerFieldsForQuery, in the same order.
// ---------------------------------------------------------------
function normalizeRows(rows, specKeys) {
  if (!rows) return [];
  const keys = Array.isArray(specKeys) ? specKeys : [];
  const bareTails = keys.map((k) => (k.includes('.') ? k.split('.').pop() : k));

  const out = [];
  // Rows themselves may be a Proxy array; iterate defensively.
  const len = typeof rows.length === 'number' ? rows.length : 0;
  for (let i = 0; i < len; i++) {
    const row = rows[i];
    if (!row || typeof row !== 'object') continue;

    // Tuple-like: numeric length but NOT a real Array. LWC often wraps
    // SDK results in a Proxy where Array.isArray returns false.
    const looksTuple =
      !Array.isArray(row) && typeof row.length === 'number' && row.length > 0;

    if (Array.isArray(row) || looksTuple) {
      const mapped = {};
      for (let j = 0; j < keys.length; j++) {
        mapped[keys[j]] = row[j];
      }
      out.push(mapped);
      continue;
    }

    // Object: pass through if already qualified; otherwise re-key from bare.
    const hasAllExpectedKeys = keys.every((k) => k in row);
    if (hasAllExpectedKeys) {
      out.push(row);
    } else {
      const mapped = {};
      for (let j = 0; j < keys.length; j++) {
        const bare = bareTails[j];
        mapped[keys[j]] = bare in row ? row[bare] : row[keys[j]];
      }
      out.push(mapped);
    }
  }
  return out;
}
