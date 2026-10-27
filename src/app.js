import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import env from './config/env.js';
import healthRouter from './routes/health.js';
import metersRouter from './routes/meters.js';
import hierarchyRouter from './routes/hierarchy.js';
import apiKeyAuth from './middleware/auth.js';
import errorHandler, { AppError } from './middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();

  // Basic security headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows Swagger UI inline scripts/styles
    })
  );

  // CORS configuration
  app.use(cors());

  // Request size limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Global rate limiter
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 'error',
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests from this IP, please try again later.',
      },
    },
  });
  app.use(limiter);

  // Serve OpenAPI JSON schema
  const openApiPath = path.join(__dirname, '../openapi.json');
  let openApiSpec = {};
  if (fs.existsSync(openApiPath)) {
    try {
      openApiSpec = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
    } catch {
      // fallback if not yet generated
    }
  }

  app.get('/openapi.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(openApiSpec);
  });

  // Interactive Swagger UI documentation
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'Flock Energy - Urja Ops API Docs',
    })
  );

  // Health check endpoint (Public)
  app.use(healthRouter);

  // Version 1 API routes (Protected by apiKeyAuth if API_KEY is set)
  const apiV1Router = express.Router();
  apiV1Router.use(apiKeyAuth);
  apiV1Router.use(metersRouter);
  apiV1Router.use(hierarchyRouter);

  app.use('/api/v1', apiV1Router);

  // Unmatched route 404 handler
  app.use((req, res, next) => {
    next(new AppError(`Route '${req.method} ${req.originalUrl}' not found`, 404, 'ROUTE_NOT_FOUND'));
  });

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
