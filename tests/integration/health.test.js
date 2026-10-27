import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('Integration: GET /health', () => {
  it('should return 200 and healthy status metadata', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('flock-energy-api');
    expect(res.body.version).toBe('1.0.0');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.upstream).toBeDefined();
    expect(res.body.upstream.url).toBeDefined();
  });
});
