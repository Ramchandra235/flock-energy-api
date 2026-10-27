import dotenv from 'dotenv';
import { z } from 'zod';

// Load local .env if present
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  URJA_BASE_URL: z.string().url().default('https://urja-ops.flockenergy.tech'),
  URJA_USERNAME: z.string().min(1, 'URJA_USERNAME must not be empty').default('operator@urja.local'),
  URJA_PASSWORD: z.string().min(1, 'URJA_PASSWORD must not be empty').default('urja-ops-2026'),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  API_KEY: z.string().optional().default(''),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000), // 15 mins
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(500),
});

/**
 * Validates given environment or process.env against schema.
 * @param {Record<string, unknown>} [customEnv]
 * @returns {z.infer<typeof envSchema>}
 */
export function validateEnv(customEnv = process.env) {
  const result = envSchema.safeParse(customEnv);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map(err => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new Error(`Configuration validation error:\n${errorDetails}`);
  }
  return Object.freeze(result.data);
}

export const env = validateEnv();
export default env;
