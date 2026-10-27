/**
 * Data normalization utilities for legacy Urja Meter Ops responses.
 */

/**
 * Safely trims strings and converts empty strings/nulls to null.
 * @param {unknown} val
 * @returns {string|null}
 */
export function trimString(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str.length > 0 ? str : null;
}

/**
 * Converts numeric strings to numbers when valid, preserving null/fallback.
 * @param {unknown} val
 * @param {number|null} [fallback=null]
 * @returns {number|null}
 */
export function parseNumeric(val, fallback = null) {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
  const str = String(val).trim();
  if (str === '') return fallback;
  const num = Number(str);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Normalizes dates from legacy format "DD/MM/YYYY HH:mm" to standard ISO format "YYYY-MM-DDTHH:mm:00".
 * Preserves the exact local wall-clock time without timezone distortion.
 * @param {string|unknown} dateStr
 * @returns {string|null}
 */
export function normalizeDate(dateStr) {
  const str = trimString(dateStr);
  if (!str) return null;

  // Expected format: DD/MM/YYYY HH:mm or DD/MM/YYYY HH:mm:ss
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    const hour = (match[4] || '00').padStart(2, '0');
    const min = (match[5] || '00').padStart(2, '0');
    const sec = (match[6] || '00').padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;
  }

  // If already standard ISO or parseable by Date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return str;
}

/**
 * Normalizes installation status to uppercase canonical enum.
 * @param {string|unknown} status
 * @returns {string}
 */
export function normalizeStatus(status) {
  const s = trimString(status);
  if (!s) return 'UNKNOWN';
  return s.toUpperCase().replace(/\s+/g, '_');
}

/**
 * Normalizes breadcrumb string "Jaipur Zone 1 (Z-01)" into structured { name, code }.
 * @param {string|unknown} text
 * @returns {{ name: string, code: string | null }}
 */
export function parseNameAndCode(text) {
  const clean = trimString(text);
  if (!clean) return { name: '', code: null };

  const match = clean.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) {
    return {
      name: match[1].trim(),
      code: match[2].trim(),
    };
  }

  return {
    name: clean,
    code: null,
  };
}

/**
 * Normalizes a meter summary object from the search endpoint or export.
 * @param {Record<string, unknown>} raw
 * @returns {object}
 */
export function normalizeMeterSummary(raw) {
  if (!raw) return null;

  return {
    meter_id: String(raw.meterId || raw.meter_id || '').trim(),
    serial_number: String(raw.serialNo || raw.serial_number || '').trim(),
    make: trimString(raw.make),
    phase_type: trimString(raw.phaseType || raw.phase_type)?.toLowerCase() || null,
    status: normalizeStatus(raw.installStatus || raw.status),
    dt_code: trimString(raw.dtCode || raw.dt_code),
  };
}

/**
 * Normalizes meter detail parameters from both legacy ({ parameterName, parameterValue })
 * and v2 ({ classData: '{"installed_meter": ...}' }) formats.
 * @param {unknown} detail
 * @returns {Record<string, string>}
 */
export function extractNameplateMap(detail) {
  const result = {};
  if (!detail || typeof detail !== 'object') return result;

  // Case 1: v2 classData JSON string
  if ('classData' in detail && typeof detail.classData === 'string') {
    try {
      const parsed = JSON.parse(detail.classData);
      const installed = parsed.installed_meter || parsed;
      for (const [key, val] of Object.entries(installed)) {
        result[key.toLowerCase()] = String(val).trim();
      }
      return result;
    } catch {
      // Fallback
    }
  }

  // Case 2: legacy array of { parameterName, parameterValue }
  if (Array.isArray(detail.data)) {
    for (const item of detail.data) {
      if (item && item.parameterName) {
        result[item.parameterName.toLowerCase().replace(/\s+/g, '_')] = String(item.parameterValue ?? '').trim();
      }
    }
  }

  return result;
}

/**
 * Normalizes a meter detail response combining nameplate, location, and hierarchy.
 * @param {object} params
 * @param {string} params.meterId
 * @param {object} [params.nameplate]
 * @param {object} [params.hierarchy]
 * @param {object} [params.geo]
 * @returns {object}
 */
export function normalizeMeterDetail({ meterId, nameplate = {}, hierarchy = {}, geo = null }) {
  const nameplateLower = {};
  for (const [k, v] of Object.entries(nameplate)) {
    nameplateLower[k.toLowerCase().replace(/[\s_-]+/g, '')] = v;
  }

  const serialNumber = nameplateLower['serialno'] || nameplateLower['serialnumber'] || null;
  const make = nameplateLower['make'] || null;
  const phaseType = (nameplateLower['phasetype'] || '').toLowerCase() || null;
  const status = normalizeStatus(nameplateLower['installationstatus'] || nameplateLower['status']);
  const installType = nameplateLower['installationtype'] || nameplateLower['installtype'] || null;

  // Format hierarchy
  const rawHierarchy = hierarchy || {};
  const formattedHierarchy = {
    zone: parseNameAndCode(rawHierarchy.Zone || rawHierarchy.zone?.name || rawHierarchy.zone),
    circle: parseNameAndCode(rawHierarchy.Circle || rawHierarchy.circle?.name || rawHierarchy.circle),
    division: parseNameAndCode(rawHierarchy.Division || rawHierarchy.division?.name || rawHierarchy.division),
    subdivision: parseNameAndCode(rawHierarchy.Subdivision || rawHierarchy.subdivision?.name || rawHierarchy.subdivision),
    substation: parseNameAndCode(rawHierarchy['Sub Station'] || rawHierarchy.substation?.name || rawHierarchy.substation),
    feeder: parseNameAndCode(rawHierarchy.Feeder || rawHierarchy.feeder?.name || rawHierarchy.feeder),
    dt: parseNameAndCode(rawHierarchy.DT || rawHierarchy.dt?.name || rawHierarchy.dt),
  };

  // Format location
  let location = null;
  if (geo && (geo.latitude || geo.lat) && (geo.longitude || geo.lng)) {
    const lat = parseNumeric(geo.latitude || geo.lat);
    const lng = parseNumeric(geo.longitude || geo.lng);
    if (lat !== null && lng !== null) {
      location = { latitude: lat, longitude: lng };
    }
  }

  return {
    meter_id: String(meterId).trim(),
    serial_number: serialNumber ? String(serialNumber).trim() : null,
    make: trimString(make),
    phase_type: phaseType,
    status,
    installation_type: trimString(installType),
    location,
    hierarchy: formattedHierarchy,
  };
}

/**
 * Normalizes consumption readings array from /portal/meters/:id/energy.
 * @param {Array<Record<string, unknown>>} readings
 * @returns {Array<object>}
 */
export function normalizeConsumption(readings = []) {
  if (!Array.isArray(readings)) return [];

  return readings.map(r => ({
    timestamp: normalizeDate(r.timestamp),
    raw_timestamp: trimString(r.timestamp),
    kwh: parseNumeric(r.kwh),
    kvah: parseNumeric(r.kvah),
    voltage_r: parseNumeric(r.voltR ?? r.voltage_r),
  }));
}
