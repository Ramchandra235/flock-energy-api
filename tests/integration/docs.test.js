import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.js';

describe('Integration: OpenAPI and Docs (/docs, /openapi.json)', () => {
  it('should serve valid OpenAPI 3 specification at /openapi.json', async () => {
    const res = await request(app).get('/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.info.title).toContain('Flock Energy');
    expect(res.body.paths['/api/v1/meters']).toBeDefined();
    expect(res.body.paths['/api/v1/meters/{id}']).toBeDefined();
    expect(res.body.paths['/api/v1/meters/{id}/consumption']).toBeDefined();
    expect(res.body.paths['/api/v1/hierarchy']).toBeDefined();
    expect(res.body.paths['/health']).toBeDefined();
  });

  it('should serve Swagger UI documentation at /docs', async () => {
    const res = await request(app).get('/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});
