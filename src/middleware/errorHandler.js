import env from '../config/env.js';

/**
 * Custom application error class with HTTP status code and machine-readable code.
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Centralized Express error-handling middleware.
 * Guarantees consistent error envelopes and ensures sensitive credentials,
 * cookies, raw HTML, and internal stack traces are never exposed to clients.
 */
export function errorHandler(err, req, res, next) {
  // If response already committed, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  let statusCode = err.statusCode || 500;
  let errorCode = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected internal error occurred';
  let details = err.details || null;

  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    }));
  }

  // Handle Axios / Upstream communication errors
  if (err.isAxiosError) {
    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      statusCode = 504;
      errorCode = 'GATEWAY_TIMEOUT';
      message = 'Upstream Urja Ops portal timed out while processing request';
    } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      statusCode = 502;
      errorCode = 'BAD_GATEWAY';
      message = 'Unable to connect to upstream Urja Ops portal';
    } else if (err.response?.status === 401) {
      statusCode = 502;
      errorCode = 'UPSTREAM_AUTH_FAILURE';
      message = 'Failed to authenticate with upstream Urja Ops portal';
    } else if (err.response?.status === 404) {
      statusCode = 404;
      errorCode = 'NOT_FOUND';
      message = 'Resource not found in upstream portal';
    } else if (err.response?.status >= 500) {
      statusCode = 502;
      errorCode = 'BAD_GATEWAY';
      message = 'Upstream Urja Ops portal returned an internal error';
    }
  }

  // Sanitize message: never leak passwords, tokens, or cookies
  if (typeof message === 'string') {
    message = message.replace(/password=[^\s&;]+/gi, 'password=***');
    message = message.replace(/session_token=[^\s&;]+/gi, 'session_token=***');
  }

  const responseBody = {
    status: 'error',
    error: {
      code: errorCode,
      message,
      ...(details ? { details } : {}),
      ...(env.NODE_ENV === 'development' && err.stack ? { stack: err.stack } : {}),
    },
  };

  res.status(statusCode).json(responseBody);
}

export default errorHandler;
