/**
 * Tableau Next SDK helpers.
 *
 * LWC does not support shared JS modules across component bundles, so
 * COPY-PASTE these functions into each LWC that talks to the SDK.
 * Keep them at file scope (above the `export default class`).
 *
 * Covers:
 *   - qualifiedModel(object, field)          -> "Object.field"
 *   - isTopLevelFieldByName(apiName)          -> _clc / _mtc naming heuristic
 *   - isCalculatedField(modelJson, apiName)   -> model-level calcs + suffix rule
 *   - findObjectForFieldApi(modelJson, api)   -> owning object apiName
 *   - resolveUserModelString(raw, modelJson)  -> qualified OR bare top-level
 *   - pickSpecsFromModelJson(modelJson)      -> 3-spec auto-pick
 *   - normalizeRows(rows, specKeys)          -> keyed row objects
 */

// ---------------------------------------------------------------
// 1. Qualified "Object.field" model string
// ---------------------------------------------------------------
function qualifiedModel(objectApi, fieldApi) {
  return `${objectApi}.${fieldApi}`;
}

// ---------------------------------------------------------------
// 1b. Tableau Next / Data Cloud naming — calc measures often end in
//     "_clc" and semantic metrics in "_mtc". Both are top-level on
//     the model and must NOT be prefixed with a data object name.
// ---------------------------------------------------------------
function isTopLevelFieldByName(apiName) {
  const n = (apiName || '').toLowerCase();
  return n.endsWith('_clc') || n.endsWith('_mtc');
}

function isCalculatedField(modelJson, fieldApiName) {
  for (const cm of modelJson?.semanticCalculatedMeasurements || []) {
    if (cm.apiName === fieldApiName) return true;
  }
  for (const cd of modelJson?.semanticCalculatedDimensions || []) {
    if (cd.apiName === fieldApiName) return true;
  }
  return isTopLevelFieldByName(fieldApiName);
}

// ---------------------------------------------------------------
// 2. Find which data object owns a given field apiName.
//    Walks semanticDataObjects[].semanticDimensions/semanticMeasurements.
//    Returns null when the field is model-level (calculated / _clc / _mtc).
//    Otherwise falls back to the first data object.
// ---------------------------------------------------------------
function findObjectForFieldApi(modelJson, fieldApiName) {
  const objs = modelJson?.semanticDataObjects || [];
  for (const obj of objs) {
    for (const d of obj.semanticDimensions || []) {
      if (d.apiName === fieldApiName) {
        return obj.apiName;
      }
    }
    for (const m of obj.semanticMeasurements || []) {
      if (m.apiName === fieldApiName) {
        return obj.apiName;
      }
    }
  }
  if (isCalculatedField(modelJson, fieldApiName)) {
    return null;
  }
  return objs[0]?.apiName ?? null;
}

// ---------------------------------------------------------------
// 3. Qualify a user-supplied field string against SDM JSON.
//    - "Object.field" -> returned as-is
//    - top-level calcs / *_clc / *_mtc -> bare apiName (no Object. prefix)
//    - "field" on an entity -> "Object.field"; else first object fallback
// ---------------------------------------------------------------
function resolveUserModelString(raw, modelJson) {
  const t = (raw || '').trim();
  if (!t) return '';
  if (t.includes('.')) return t;
  if (isCalculatedField(modelJson, t)) {
    return t;
  }
  const obj = findObjectForFieldApi(modelJson, t);
  if (obj) return qualifiedModel(obj, t);
  const fallbackObj = modelJson?.semanticDataObjects?.[0]?.apiName;
  return fallbackObj ? qualifiedModel(fallbackObj, t) : t;
}

// ---------------------------------------------------------------
// 4. Auto-pick three specs: date dimension, non-id text dimension,
//    first measurement with its aggregationType.
//    Returns null if any of the three cannot be found.
// ---------------------------------------------------------------
function pickSpecsFromModelJson(modelJson) {
  const objects = modelJson?.semanticDataObjects || [];
  if (!objects.length) return null;

  let dateField = null, dateObj = null;
  let dimField = null, dimObj = null;
  let measField = null, measObj = null;
  let measAgg = 'Sum';

  for (const obj of objects) {
    const oName = obj.apiName;
    for (const d of obj.semanticDimensions || []) {
      const dt = d.dataType;
      const api = d.apiName;
      if ((dt === 'Date' || dt === 'DateTime') && !dateField) {
        dateField = api;
        dateObj = oName;
      }
      if (
        dt === 'Text' &&
        !dimField &&
        api &&
        !api.toLowerCase().endsWith('_id') &&
        !api.toLowerCase().includes('external_id')
      ) {
        dimField = api;
        dimObj = oName;
      }
    }
    for (const m of obj.semanticMeasurements || []) {
      if (!measField && m.apiName) {
        measField = m.apiName;
        measObj = oName;
        measAgg = m.aggregationType || 'Sum';
      }
    }
  }

  if (!dateField || !dimField || !measField) return null;

  const specs = [
    { model: qualifiedModel(dateObj, dateField), rowGrouping: true },
    { model: qualifiedModel(dimObj, dimField), rowGrouping: true },
    {
      model: qualifiedModel(measObj, measField),
      rowGrouping: false,
      aggregationType: measAgg
    }
  ];
  const summary = `${specs[0].model}, ${specs[1].model}, ${specs[2].model} (agg ${measAgg})`;
  return { specs, summary };
}

// ---------------------------------------------------------------
// 5. Normalize fetchData() output to { [qualifiedModel]: value } rows.
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
    const hasQualified = keys.some((k) => k in row);
    if (hasQualified) {
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
