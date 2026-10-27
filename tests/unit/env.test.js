import { describe, it, expect } from 'vitest';
import { validateEnv } from '../../src/config/env.js';

describe('Environment Validation (config/env.js)', () => {
  it('should validate valid environment variables and provide defaults', () => {
    const config = validateEnv({
      PORT: '4000',
      NODE_ENV: 'test',
      URJA_BASE_URL: 'https://urja-ops.flockenergy.tech',
      URJA_USERNAME: 'operator@urja.local',
      URJA_PASSWORD: 'test-password',
    });

    expect(config.PORT).toBe(4000);
    expect(config.NODE_ENV).toBe('test');
    expect(config.URJA_BASE_URL).toBe('https://urja-ops.flockenergy.tech');
    expect(config.URJA_USERNAME).toBe('operator@urja.local');
    expect(config.URJA_PASSWORD).toBe('test-password');
    expect(config.UPSTREAM_TIMEOUT_MS).toBe(10000);
    expect(config.RATE_LIMIT_MAX).toBe(500);
  });

  it('should throw an error if URJA_BASE_URL is not a valid URL', () => {
    expect(() => {
      validateEnv({
        URJA_BASE_URL: 'not-a-valid-url',
        URJA_USERNAME: 'user',
        URJA_PASSWORD: 'pwd',
      });
    }).toThrow(/Configuration validation error/);
  });

  it('should throw an error if URJA_USERNAME is empty', () => {
    expect(() => {
      validateEnv({
        URJA_USERNAME: '',
        URJA_PASSWORD: 'pwd',
      });
    }).toThrow(/URJA_USERNAME must not be empty/);
  });

  it('should throw an error if NODE_ENV is invalid', () => {
    expect(() => {
      validateEnv({
        NODE_ENV: 'staging',
        URJA_USERNAME: 'user',
        URJA_PASSWORD: 'pwd',
      });
    }).toThrow(/Invalid enum value/);
  });
});
