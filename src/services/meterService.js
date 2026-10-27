import * as cheerio from 'cheerio';
import urjaClient from '../clients/urjaClient.js';
import {
  normalizeMeterSummary,
  normalizeMeterDetail,
  normalizeConsumption,
  parseNameAndCode,
} from '../utils/normalize.js';

export class MeterService {
  constructor(client = urjaClient) {
    this.client = client;
    this.hierarchyCache = null;
    this.hierarchyCacheExpiresAt = 0;
  }

  /**
   * Lists meters with optional search query and pagination.
   * @param {object} params
   * @param {string} [params.q='']
   * @param {number} [params.page=1]
   */
  async listMeters({ q = '', page = 1 } = {}) {
    const raw = await this.client.searchMeters(q, page);
    const meters = (raw.data || []).map(m => normalizeMeterSummary(m));
    const pageSize = raw.pageSize || 20;
    const total = raw.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return {
      meters,
      pagination: {
        page: raw.page || page,
        page_size: pageSize,
        total,
        total_pages: totalPages,
      },
    };
  }

  /**
   * Retrieves single meter details by parsing HTML/SSR state and geo coordinates.
   * @param {string} id
   */
  async getMeterById(id) {
    const cleanId = String(id).trim();

    // Fetch HTML page and Geo coordinates concurrently
    const [pageResult, geo] = await Promise.all([
      this.client.getMeterHtml(cleanId),
      this.client.getMeterGeo(cleanId),
    ]);

    if (!pageResult || pageResult.status === 404 || !pageResult.html) {
      return null;
    }

    const $ = cheerio.load(pageResult.html);

    // Verify page is not a 404 error page
    const pageTitle = $('title').text().trim();
    if (pageTitle.includes('404') || pageTitle.includes('Not Found') || $('h1').text().includes('Not Found')) {
      return null;
    }

    // 1. Extract nameplate parameters from DL
    const nameplate = {};
    $('dl div').each((_, div) => {
      const key = $(div).find('dt').text().trim();
      const val = $(div).find('dd').text().trim();
      if (key) {
        nameplate[key] = val;
      }
    });

    // 2. Extract hierarchy breadcrumbs from nav
    const hierarchy = {};
    const breadcrumbSpans = $('nav.flex.flex-wrap span')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(t => t && t !== '›');

    // Expected hierarchy order: Zone -> Circle -> Division -> Subdivision -> Substation -> Feeder -> DT
    const hierarchyKeys = ['Zone', 'Circle', 'Division', 'Subdivision', 'Sub Station', 'Feeder', 'DT'];
    hierarchyKeys.forEach((key, index) => {
      if (breadcrumbSpans[index]) {
        hierarchy[key] = breadcrumbSpans[index];
      }
    });

    // 3. Fallback: Parse SvelteKit script data if DL was empty
    if (Object.keys(nameplate).length === 0) {
      const scriptContent = $('script').text();
      const match = scriptContent.match(/detail:\s*(\{[\s\S]*?\}),\s*hierarchy:\s*(\{[\s\S]*?\})/);
      if (match) {
        try {
          const rawDetail = JSON.parse(match[1]);
          const rawHierarchy = JSON.parse(match[2]);
          Object.assign(hierarchy, rawHierarchy);
          if (Array.isArray(rawDetail.data)) {
            for (const item of rawDetail.data) {
              nameplate[item.parameterName] = item.parameterValue;
            }
          }
        } catch {
          // ignore JSON parse fallback errors
        }
      }
    }

    // If still no meter id or serial, this meter was not found or invalid
    if (!nameplate['Meter ID'] && Object.keys(nameplate).length === 0) {
      return null;
    }

    return normalizeMeterDetail({
      meterId: nameplate['Meter ID'] || cleanId,
      nameplate,
      hierarchy,
      geo,
    });
  }

  /**
   * Retrieves consumption readings for a meter.
   * @param {string} id
   */
  async getMeterConsumption(id) {
    const cleanId = String(id).trim();
    const rawReadings = await this.client.getMeterEnergy(cleanId);

    if (rawReadings === null) {
      return null;
    }

    const readings = normalizeConsumption(rawReadings);
    return {
      meter_id: cleanId,
      readings_count: readings.length,
      readings,
    };
  }

  /**
   * Retrieves the network hierarchy tree reconstructed from upstream DTs and meters.
   * Caches result in memory for 10 minutes to minimize upstream load.
   */
  async getNetworkHierarchy({ forceRefresh = false } = {}) {
    const now = Date.now();
    if (!forceRefresh && this.hierarchyCache && now < this.hierarchyCacheExpiresAt) {
      return this.hierarchyCache;
    }

    // Export meters dataset which contains full verified hierarchy tree
    const exportResult = await this.client.exportMeters();
    const meters = exportResult?.data || [];

    // Reconstruct hierarchy structure
    const zonesMap = new Map();

    for (const meter of meters) {
      const h = meter.hierarchy || {};
      const z = h.zone || { name: 'Unknown Zone', code: 'Z-00' };
      const c = h.circle || { name: 'Unknown Circle', code: 'C-00' };
      const d = h.division || { name: 'Unknown Division', code: 'D-00' };
      const sd = h.subdivision || { name: 'Unknown Subdivision', code: 'SD-00' };
      const ss = h.substation || { name: 'Unknown Substation', code: 'SS-00' };
      const f = h.feeder || { name: 'Unknown Feeder', code: 'F-000' };
      const dt = h.dt || { name: 'Unknown DT', code: meter.dtCode || 'DT-000' };

      if (!zonesMap.has(z.code)) {
        zonesMap.set(z.code, { ...z, circles: new Map() });
      }
      const zoneNode = zonesMap.get(z.code);

      if (!zoneNode.circles.has(c.code)) {
        zoneNode.circles.set(c.code, { ...c, divisions: new Map() });
      }
      const circleNode = zoneNode.circles.get(c.code);

      if (!circleNode.divisions.has(d.code)) {
        circleNode.divisions.set(d.code, { ...d, subdivisions: new Map() });
      }
      const divNode = circleNode.divisions.get(d.code);

      if (!divNode.subdivisions.has(sd.code)) {
        divNode.subdivisions.set(sd.code, { ...sd, substations: new Map() });
      }
      const sdNode = divNode.subdivisions.get(sd.code);

      if (!sdNode.substations.has(ss.code)) {
        sdNode.substations.set(ss.code, { ...ss, feeders: new Map() });
      }
      const ssNode = sdNode.substations.get(ss.code);

      if (!ssNode.feeders.has(f.code)) {
        ssNode.feeders.set(f.code, { ...f, transformers: new Map() });
      }
      const feederNode = ssNode.feeders.get(f.code);

      if (!feederNode.transformers.has(dt.code)) {
        feederNode.transformers.set(dt.code, { ...dt, meter_count: 0, meters: [] });
      }
      const dtNode = feederNode.transformers.get(dt.code);
      dtNode.meter_count += 1;
      dtNode.meters.push(meter.meterId);
    }

    // Convert nested Maps to clean arrays
    const formattedZones = Array.from(zonesMap.values()).map(zone => ({
      name: zone.name,
      code: zone.code,
      circles: Array.from(zone.circles.values()).map(circle => ({
        name: circle.name,
        code: circle.code,
        divisions: Array.from(circle.divisions.values()).map(div => ({
          name: div.name,
          code: div.code,
          subdivisions: Array.from(div.subdivisions.values()).map(subdiv => ({
            name: subdiv.name,
            code: subdiv.code,
            substations: Array.from(subdiv.substations.values()).map(substation => ({
              name: substation.name,
              code: substation.code,
              feeders: Array.from(substation.feeders.values()).map(feeder => ({
                name: feeder.name,
                code: feeder.code,
                transformers: Array.from(feeder.transformers.values()),
              })),
            })),
          })),
        })),
      })),
    }));

    const result = {
      total_meters_indexed: meters.length,
      total_zones: formattedZones.length,
      zones: formattedZones,
    };

    // Cache for 10 minutes
    this.hierarchyCache = result;
    this.hierarchyCacheExpiresAt = now + 10 * 60 * 1000;

    return result;
  }
}

export const meterService = new MeterService();
export default meterService;
