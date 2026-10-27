import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import meterService from '../../src/services/meterService.js';

describe('Integration: Meters Endpoints (/api/v1/meters)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/meters', () => {
    it('should return paginated list of meters on success', async () => {
      vi.spyOn(meterService, 'listMeters').mockResolvedValue({
        meters: [
          {
            meter_id: 'J100000',
            serial_number: 'SE33962',
            make: 'HPL',
            phase_type: 'single',
            status: 'DECOMMISSIONED',
            dt_code: 'DT-001',
          },
        ],
        pagination: {
          page: 1,
          page_size: 20,
          total: 403,
          total_pages: 21,
        },
      });

      const res = await request(app).get('/api/v1/meters?q=J100000&page=1');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].meter_id).toBe('J100000');
      expect(res.body.pagination.total).toBe(403);
    });

    it('should return 400 Bad Request if query parameters are invalid', async () => {
      const res = await request(app).get('/api/v1/meters?page=-5');
      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
    });
  });

  describe('GET /api/v1/meters/:id', () => {
    it('should return meter details when meter exists', async () => {
      vi.spyOn(meterService, 'getMeterById').mockResolvedValue({
        meter_id: 'J100000',
        serial_number: 'SE33962',
        make: 'HPL',
        phase_type: 'single',
        status: 'DECOMMISSIONED',
        installation_type: 'Whole Current',
        location: {
          latitude: 26.938961,
          longitude: 75.830957,
        },
        hierarchy: {
          zone: { name: 'Jaipur Zone 1', code: 'Z-01' },
          circle: { name: 'Circle 1', code: 'C-01' },
          division: { name: 'Division 1', code: 'D-01' },
          subdivision: { name: 'Subdivision 1', code: 'SD-01' },
          substation: { name: 'Substation 1', code: 'SS-01' },
          feeder: { name: 'Feeder 1', code: 'F-001' },
          dt: { name: 'Malviya Nagar DT 1', code: 'DT-001' },
        },
      });

      const res = await request(app).get('/api/v1/meters/J100000');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.meter_id).toBe('J100000');
      expect(res.body.data.status).toBe('DECOMMISSIONED');
      expect(res.body.data.location.latitude).toBe(26.938961);
      expect(res.body.data.hierarchy.zone.code).toBe('Z-01');
    });

    it('should return 404 Not Found when meter does not exist', async () => {
      vi.spyOn(meterService, 'getMeterById').mockResolvedValue(null);

      const res = await request(app).get('/api/v1/meters/NONEXISTENT');
      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
      expect(res.body.error.code).toBe('METER_NOT_FOUND');
    });

    it('should return 400 Bad Request if meter id format contains forbidden characters', async () => {
      const res = await request(app).get('/api/v1/meters/invalid!@#');
      expect(res.status).toBe(400);
      expect(res.body.status).toBe('error');
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/meters/:id/consumption', () => {
    it('should return consumption readings for valid meter', async () => {
      vi.spyOn(meterService, 'getMeterConsumption').mockResolvedValue({
        meter_id: 'J100000',
        readings_count: 2,
        readings: [
          {
            timestamp: '2026-06-23T23:30:00Z',
            raw_timestamp: '23/06/2026 23:30',
            kwh: 48438.74,
            kvah: 52313.84,
            voltage_r: 226,
          },
          {
            timestamp: '2026-06-24T00:00:00Z',
            raw_timestamp: '24/06/2026 00:00',
            kwh: 48439.16,
            kvah: 52314.29,
            voltage_r: 229,
          },
        ],
      });

      const res = await request(app).get('/api/v1/meters/J100000/consumption');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.meter_id).toBe('J100000');
      expect(res.body.data.readings_count).toBe(2);
      expect(res.body.data.readings[0].kwh).toBe(48438.74);
    });

    it('should return 404 Not Found if meter consumption is not found', async () => {
      vi.spyOn(meterService, 'getMeterConsumption').mockResolvedValue(null);

      const res = await request(app).get('/api/v1/meters/NONEXISTENT/consumption');
      expect(res.status).toBe(404);
      expect(res.body.status).toBe('error');
      expect(res.body.error.code).toBe('METER_NOT_FOUND');
    });
  });
});
