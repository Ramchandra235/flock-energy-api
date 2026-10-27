import { Router } from 'express';
import env from '../config/env.js';
import urjaClient from '../clients/urjaClient.js';

export const healthRouter = Router();

healthRouter.get('/health', async (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'flock-energy-api',
    version: '1.0.0',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    upstream: {
      url: env.URJA_BASE_URL,
      authenticated: urjaClient.isAuthenticated,
    },
  });
});

export default healthRouter;
