import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import meterService from '../../src/services/meterService.js';

describe('Integration: Hierarchy Endpoint (/api/v1/hierarchy)', () => {
  it('should return reconstructed hierarchy tree', async () => {
    vi.spyOn(meterService, 'getNetworkHierarchy').mockResolvedValue({
      total_meters_indexed: 403,
      total_zones: 1,
      zones: [
        {
          name: 'Jaipur Zone 1',
          code: 'Z-01',
          circles: [
            {
              name: 'Circle 1',
              code: 'C-01',
              divisions: [],
            },
          ],
        },
      ],
    });

    const res = await request(app).get('/api/v1/hierarchy');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.total_meters_indexed).toBe(403);
    expect(res.body.data.zones).toHaveLength(1);
    expect(res.body.data.zones[0].code).toBe('Z-01');
  });

  it('should accept refresh=true query parameter to bypass cache', async () => {
    const spy = vi.spyOn(meterService, 'getNetworkHierarchy').mockResolvedValue({
      total_meters_indexed: 403,
      total_zones: 1,
      zones: [],
    });

    const res = await request(app).get('/api/v1/hierarchy?refresh=true');
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith({ forceRefresh: true });
  });
});
