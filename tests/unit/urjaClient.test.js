import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UrjaClient } from '../../src/clients/urjaClient.js';

describe('UrjaClient Unit Tests (clients/urjaClient.js)', () => {
  let client;

  beforeEach(() => {
    client = new UrjaClient({
      baseUrl: 'https://mock.flockenergy.tech',
      username: 'operator@urja.local',
      password: 'test-password',
      timeout: 1000,
    });
  });

  it('should authenticate successfully when upstream returns redirect with session cookie', async () => {
    // Mock login POST
    client.http.post = vi.fn().mockImplementation(async (path, data, config) => {
      // simulate setting cookie in jar
      await client.cookieJar.setCookie(
        '__Secure-better-auth.session_token=test_token; Path=/',
        'https://mock.flockenergy.tech'
      );
      return {
        status: 200,
        data: { type: 'redirect', status: 303, location: '/meters' },
        headers: {},
      };
    });

    await client.login();
    expect(client.isAuthenticated).toBe(true);
    expect(client.http.post).toHaveBeenCalledTimes(1);

    // Verify Origin and Referer headers were passed
    const callArgs = client.http.post.mock.calls[0];
    expect(callArgs[2].headers['Origin']).toBe('https://mock.flockenergy.tech');
    expect(callArgs[2].headers['Referer']).toBe('https://mock.flockenergy.tech/login');
  });

  it('should throw error when upstream returns failure json payload (even with HTTP 200)', async () => {
    client.http.post = vi.fn().mockResolvedValue({
      status: 200,
      data: { type: 'failure', status: 401, data: 'Invalid email or password.' },
      headers: {},
    });

    await expect(client.login()).rejects.toThrow(/Upstream authentication rejected credentials/);
    expect(client.isAuthenticated).toBe(false);
  });

  it('should share login promise during concurrent login attempts', async () => {
    let callCount = 0;
    client.http.post = vi.fn().mockImplementation(async () => {
      callCount++;
      await new Promise(r => setTimeout(r, 50));
      await client.cookieJar.setCookie(
        '__Secure-better-auth.session_token=token; Path=/',
        'https://mock.flockenergy.tech'
      );
      return {
        status: 200,
        data: { type: 'redirect', status: 303 },
        headers: {},
      };
    });

    // Fire 3 simultaneous logins
    await Promise.all([client.login(), client.login(), client.login()]);

    expect(callCount).toBe(1);
    expect(client.http.post).toHaveBeenCalledTimes(1);
    expect(client.isAuthenticated).toBe(true);
  });

  it('should not call login if already authenticated', async () => {
    client.isAuthenticated = true;
    client.http.get = vi.fn().mockResolvedValue({
      data: { data: [], total: 0, page: 1, pageSize: 20 },
    });

    await client.searchMeters('test', 1);

    expect(client.http.get).toHaveBeenCalledWith('/portal/meters/search', {
      params: { q: 'test', page: 1 },
    });
  });

  it('should return null on 404 for getMeterGeo', async () => {
    client.isAuthenticated = true;
    client.http.get = vi.fn().mockRejectedValue({
      response: { status: 404 },
    });

    const result = await client.getMeterGeo('NONEXISTENT');
    expect(result).toBeNull();
  });
});
