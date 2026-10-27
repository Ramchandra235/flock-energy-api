import env from '../config/env.js';
import { AppError } from './errorHandler.js';

/**
 * Access control middleware.
 * If API_KEY is set in environment, enforces authentication via 'x-api-key' header.
 * If API_KEY is empty (local dev), permits requests without authorization.
 */
export function apiKeyAuth(req, res, next) {
  // If no API_KEY configured on this wrapper, open for development
  if (!env.API_KEY || env.API_KEY.trim() === '') {
    return next();
  }

  const clientKey = req.headers['x-api-key'] || req.query['api_key'];

  if (!clientKey || clientKey !== env.API_KEY) {
    return next(new AppError('Unauthorized: Missing or invalid API key in x-api-key header', 401, 'UNAUTHORIZED'));
  }

  next();
}

export default apiKeyAuth;
