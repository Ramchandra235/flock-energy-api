import { describe, it, expect } from 'vitest';
import {
  trimString,
  parseNumeric,
  normalizeDate,
  normalizeStatus,
  parseNameAndCode,
  normalizeMeterSummary,
  extractNameplateMap,
  normalizeMeterDetail,
  normalizeConsumption,
} from '../../src/utils/normalize.js';

describe('Data Normalization (utils/normalize.js)', () => {
  describe('trimString', () => {
    it('should trim string and return null for empty or undefined', () => {
      expect(trimString('  hello world  ')).toBe('hello world');
      expect(trimString('')).toBeNull();
      expect(trimString('   ')).toBeNull();
      expect(trimString(null)).toBeNull();
      expect(trimString(undefined)).toBeNull();
    });
  });

  describe('parseNumeric', () => {
    it('should parse valid numbers and strings', () => {
      expect(parseNumeric('42')).toBe(42);
      expect(parseNumeric('48438.74')).toBe(48438.74);
      expect(parseNumeric(100)).toBe(100);
      expect(parseNumeric(0)).toBe(0);
    });

    it('should return fallback for invalid numbers or empty strings', () => {
      expect(parseNumeric('not-a-number')).toBeNull();
      expect(parseNumeric('not-a-number', 0)).toBe(0);
      expect(parseNumeric('', null)).toBeNull();
      expect(parseNumeric(null)).toBeNull();
    });
  });

  describe('normalizeDate', () => {
    it('should convert DD/MM/YYYY HH:mm to ISO 8601 UTC string', () => {
      expect(normalizeDate('23/06/2026 23:30')).toBe('2026-06-23T23:30:00Z');
      expect(normalizeDate('05/01/2026 09:15:30')).toBe('2026-01-05T09:15:30Z');
    });

    it('should handle already formatted ISO strings and nulls', () => {
      expect(normalizeDate(null)).toBeNull();
      expect(normalizeDate('')).toBeNull();
      const iso = '2026-06-23T23:30:00.000Z';
      expect(normalizeDate(iso)).toBe(iso);
    });
  });

  describe('normalizeStatus', () => {
    it('should normalize statuses to uppercase canonical strings', () => {
      expect(normalizeStatus('Installed')).toBe('INSTALLED');
      expect(normalizeStatus('Decommissioned')).toBe('DECOMMISSIONED');
      expect(normalizeStatus('Faulty')).toBe('FAULTY');
      expect(normalizeStatus('in repair')).toBe('IN_REPAIR');
      expect(normalizeStatus(null)).toBe('UNKNOWN');
    });
  });

  describe('parseNameAndCode', () => {
    it('should extract name and code from "Name (CODE)" string', () => {
      expect(parseNameAndCode('Jaipur Zone 1 (Z-01)')).toEqual({
        name: 'Jaipur Zone 1',
        code: 'Z-01',
      });
      expect(parseNameAndCode('Malviya Nagar DT 1 (DT-001)')).toEqual({
        name: 'Malviya Nagar DT 1',
        code: 'DT-001',
      });
    });

    it('should handle strings without code parenthesis', () => {
      expect(parseNameAndCode('Standalone Zone')).toEqual({
        name: 'Standalone Zone',
        code: null,
      });
      expect(parseNameAndCode('')).toEqual({
        name: '',
        code: null,
      });
    });
  });

  describe('normalizeMeterSummary', () => {
    it('should format raw search meter item into clean model', () => {
      const raw = {
        meterId: 'J100000',
        serialNo: 'SE33962',
        make: '  HPL  ',
        phaseType: 'single',
        installStatus: 'Decommissioned',
        dtCode: 'DT-001',
      };

      const normalized = normalizeMeterSummary(raw);
      expect(normalized).toEqual({
        meter_id: 'J100000',
        serial_number: 'SE33962',
        make: 'HPL',
        phase_type: 'single',
        status: 'DECOMMISSIONED',
        dt_code: 'DT-001',
      });
    });
  });

  describe('extractNameplateMap', () => {
    it('should extract from legacy array format', () => {
      const legacyDetail = {
        data: [
          { parameterName: 'Meter ID', parameterValue: 'J100000' },
          { parameterName: 'Serial No', parameterValue: 'SE33962' },
          { parameterName: 'Make', parameterValue: 'HPL' },
        ],
      };
      const map = extractNameplateMap(legacyDetail);
      expect(map.meter_id).toBe('J100000');
      expect(map.serial_no).toBe('SE33962');
      expect(map.make).toBe('HPL');
    });

    it('should extract from v2 classData JSON string format', () => {
      const v2Detail = {
        classData: JSON.stringify({
          installed_meter: {
            MeterId: 'J100004',
            SerialNo: 'SE65293',
            Make: 'Genus',
          },
        }),
      };
      const map = extractNameplateMap(v2Detail);
      expect(map.meterid).toBe('J100004');
      expect(map.serialno).toBe('SE65293');
      expect(map.make).toBe('Genus');
    });
  });

  describe('normalizeMeterDetail', () => {
    it('should construct comprehensive meter detail model', () => {
      const nameplate = {
        'Meter ID': 'J100000',
        'Serial No': 'SE33962',
        'Make': 'HPL',
        'Phase Type': 'single',
        'Installation Status': 'Decommissioned',
        'Installation Type': 'Whole Current',
      };

      const hierarchy = {
        'Zone': 'Jaipur Zone 1 (Z-01)',
        'Circle': 'Circle 1 (C-01)',
        'Division': 'Division 1 (D-01)',
        'Subdivision': 'Subdivision 1 (SD-01)',
        'Sub Station': 'Substation 1 (SS-01)',
        'Feeder': 'Feeder 1 (F-001)',
        'DT': 'Malviya Nagar DT 1 (DT-001)',
      };

      const geo = {
        latitude: '26.938961',
        longitude: '75.830957',
      };

      const normalized = normalizeMeterDetail({
        meterId: 'J100000',
        nameplate,
        hierarchy,
        geo,
      });

      expect(normalized.meter_id).toBe('J100000');
      expect(normalized.serial_number).toBe('SE33962');
      expect(normalized.status).toBe('DECOMMISSIONED');
      expect(normalized.installation_type).toBe('Whole Current');
      expect(normalized.location).toEqual({
        latitude: 26.938961,
        longitude: 75.830957,
      });
      expect(normalized.hierarchy.zone).toEqual({
        name: 'Jaipur Zone 1',
        code: 'Z-01',
      });
      expect(normalized.hierarchy.dt).toEqual({
        name: 'Malviya Nagar DT 1',
        code: 'DT-001',
      });
    });
  });

  describe('normalizeConsumption', () => {
    it('should normalize array of raw energy readings', () => {
      const raw = [
        {
          timestamp: '23/06/2026 23:30',
          kwh: '48438.74',
          kvah: '52313.84',
          voltR: '226',
        },
      ];

      const result = normalizeConsumption(raw);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        timestamp: '2026-06-23T23:30:00Z',
        raw_timestamp: '23/06/2026 23:30',
        kwh: 48438.74,
        kvah: 52313.84,
        voltage_r: 226,
      });
    });
  });
});
