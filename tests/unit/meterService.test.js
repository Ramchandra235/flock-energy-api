import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeterService } from '../../src/services/meterService.js';

describe('MeterService Unit Tests (services/meterService.js)', () => {
  let mockClient;
  let service;

  beforeEach(() => {
    mockClient = {
      searchMeters: vi.fn(),
      getMeterHtml: vi.fn(),
      getMeterGeo: vi.fn(),
      getMeterEnergy: vi.fn(),
      exportMeters: vi.fn(),
    };
    service = new MeterService(mockClient);
  });

  describe('listMeters', () => {
    it('should normalize meters list and compute pagination', async () => {
      mockClient.searchMeters.mockResolvedValue({
        data: [
          {
            meterId: 'J100000',
            serialNo: 'SE33962',
            make: 'HPL',
            phaseType: 'single',
            installStatus: 'Decommissioned',
            dtCode: 'DT-001',
          },
        ],
        total: 45,
        page: 1,
        pageSize: 20,
      });

      const res = await service.listMeters({ q: '', page: 1 });
      expect(res.meters).toHaveLength(1);
      expect(res.meters[0].meter_id).toBe('J100000');
      expect(res.meters[0].status).toBe('DECOMMISSIONED');
      expect(res.pagination).toEqual({
        page: 1,
        page_size: 20,
        total: 45,
        total_pages: 3,
      });
    });
  });

  describe('getMeterById', () => {
    it('should parse HTML page nameplate and merge geo coordinates', async () => {
      const mockHtml = `
        <!doctype html>
        <html>
          <head><title>Meter J100000</title></head>
          <body>
            <h1>Meter J100000</h1>
            <nav class="flex flex-wrap">
              <span>Jaipur Zone 1 (Z-01)</span>
              <span>›</span>
              <span>Circle 1 (C-01)</span>
              <span>›</span>
              <span>Division 1 (D-01)</span>
              <span>›</span>
              <span>Subdivision 1 (SD-01)</span>
              <span>›</span>
              <span>Substation 1 (SS-01)</span>
              <span>›</span>
              <span>Feeder 1 (F-001)</span>
              <span>›</span>
              <span>Malviya Nagar DT 1 (DT-001)</span>
            </nav>
            <dl>
              <div><dt>Meter ID</dt><dd>J100000</dd></div>
              <div><dt>Serial No</dt><dd>SE33962</dd></div>
              <div><dt>Make</dt><dd>HPL</dd></div>
              <div><dt>Phase Type</dt><dd>single</dd></div>
              <div><dt>Installation Status</dt><dd>Decommissioned</dd></div>
              <div><dt>Installation Type</dt><dd>Whole Current</dd></div>
            </dl>
          </body>
        </html>
      `;

      mockClient.getMeterHtml.mockResolvedValue({ html: mockHtml, status: 200 });
      mockClient.getMeterGeo.mockResolvedValue({ latitude: '26.9389', longitude: '75.8309' });

      const meter = await service.getMeterById('J100000');
      expect(meter).not.toBeNull();
      expect(meter.meter_id).toBe('J100000');
      expect(meter.serial_number).toBe('SE33962');
      expect(meter.status).toBe('DECOMMISSIONED');
      expect(meter.location).toEqual({ latitude: 26.9389, longitude: 75.8309 });
      expect(meter.hierarchy.zone.name).toBe('Jaipur Zone 1');
      expect(meter.hierarchy.dt.code).toBe('DT-001');
    });

    it('should return null if HTML returns 404 or missing page', async () => {
      mockClient.getMeterHtml.mockResolvedValue({ html: null, status: 404 });
      mockClient.getMeterGeo.mockResolvedValue(null);

      const res = await service.getMeterById('NONEXISTENT');
      expect(res).toBeNull();
    });
  });

  describe('getMeterConsumption', () => {
    it('should format consumption readings', async () => {
      mockClient.getMeterEnergy.mockResolvedValue([
        {
          timestamp: '23/06/2026 23:30',
          kwh: '48438.74',
          kvah: '52313.84',
          voltR: '226',
        },
      ]);

      const res = await service.getMeterConsumption('J100000');
      expect(res.meter_id).toBe('J100000');
      expect(res.readings_count).toBe(1);
      expect(res.readings[0].kwh).toBe(48438.74);
      expect(res.readings[0].timestamp).toBe('2026-06-23T23:30:00Z');
    });

    it('should return null if upstream reports 404', async () => {
      mockClient.getMeterEnergy.mockResolvedValue(null);

      const res = await service.getMeterConsumption('NONEXISTENT');
      expect(res).toBeNull();
    });
  });

  describe('getNetworkHierarchy', () => {
    it('should reconstruct hierarchy tree and cache results', async () => {
      mockClient.exportMeters.mockResolvedValue({
        total: 1,
        data: [
          {
            meterId: 'J100000',
            dtCode: 'DT-001',
            hierarchy: {
              zone: { name: 'Jaipur Zone 1', code: 'Z-01' },
              circle: { name: 'Circle 1', code: 'C-01' },
              division: { name: 'Division 1', code: 'D-01' },
              subdivision: { name: 'Subdivision 1', code: 'SD-01' },
              substation: { name: 'Substation 1', code: 'SS-01' },
              feeder: { name: 'Feeder 1', code: 'F-001' },
              dt: { name: 'Malviya Nagar DT 1', code: 'DT-001' },
            },
          },
        ],
      });

      const res1 = await service.getNetworkHierarchy();
      expect(res1.total_meters_indexed).toBe(1);
      expect(res1.zones).toHaveLength(1);
      expect(res1.zones[0].circles[0].divisions[0].subdivisions[0].substations[0].feeders[0].transformers[0].code).toBe('DT-001');

      // Second call should return cached response without calling exportMeters again
      const res2 = await service.getNetworkHierarchy();
      expect(res2).toEqual(res1);
      expect(mockClient.exportMeters).toHaveBeenCalledTimes(1);
    });
  });
});
