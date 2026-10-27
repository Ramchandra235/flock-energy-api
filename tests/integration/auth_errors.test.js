import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';
import meterService from '../../src/services/meterService.js';

describe('Integration: Error Handling & Security Scenarios', () => {
  it('should return 404 for non-existent route with standard error format', async () => {
    const res = await request(app).get('/api/v1/unknown-endpoint');
    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(res.body.error.message).toContain('Route \'GET /api/v1/unknown-endpoint\' not found');
  });

  it('should map upstream network connection failure to 502 Bad Gateway', async () => {
    const error = new Error('getaddrinfo ENOTFOUND urja-ops.flockenergy.tech');
    error.isAxiosError = true;
    error.code = 'ENOTFOUND';

    vi.spyOn(meterService, 'listMeters').mockRejectedValue(error);

    const res = await request(app).get('/api/v1/meters');
    expect(res.status).toBe(502);
    expect(res.body.status).toBe('error');
    expect(res.body.error.code).toBe('BAD_GATEWAY');
    expect(res.body.error.message).toBe('Unable to connect to upstream Urja Ops portal');
  });

  it('should map upstream timeout to 504 Gateway Timeout', async () => {
    const error = new Error('timeout of 10000ms exceeded');
    error.isAxiosError = true;
    error.code = 'ECONNABORTED';

    vi.spyOn(meterService, 'listMeters').mockRejectedValue(error);

    const res = await request(app).get('/api/v1/meters');
    expect(res.status).toBe(504);
    expect(res.body.status).toBe('error');
    expect(res.body.error.code).toBe('GATEWAY_TIMEOUT');
    expect(res.body.error.message).toBe('Upstream Urja Ops portal timed out while processing request');
  });

  it('should sanitize error message to avoid leaking passwords or session tokens', async () => {
    const error = new Error('Failed with password=secret_password and session_token=secret_token_123');
    vi.spyOn(meterService, 'listMeters').mockRejectedValue(error);

    const res = await request(app).get('/api/v1/meters');
    expect(res.body.error.message).not.toContain('secret_password');
    expect(res.body.error.message).not.toContain('secret_token_123');
    expect(res.body.error.message).toContain('password=***');
    expect(res.body.error.message).toContain('session_token=***');
  });
});
