import { Router } from 'express';
import { z } from 'zod';
import meterService from '../services/meterService.js';
import validateRequest from '../middleware/validate.js';

export const hierarchyRouter = Router();

const hierarchyQuerySchema = z.object({
  refresh: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform(val => val === 'true' || val === '1'),
});

/**
 * GET /api/v1/hierarchy
 * Retrieve network hierarchy tree (Zones -> Circles -> Divisions -> Subdivisions -> Substations -> Feeders -> DTs)
 */
hierarchyRouter.get(
  '/hierarchy',
  validateRequest({ query: hierarchyQuerySchema }),
  async (req, res, next) => {
    try {
      const forceRefresh = Boolean(req.query.refresh);
      const hierarchy = await meterService.getNetworkHierarchy({ forceRefresh });
      res.status(200).json({
        status: 'success',
        data: hierarchy,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default hierarchyRouter;
