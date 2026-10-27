import { Router } from 'express';
import { z } from 'zod';
import meterService from '../services/meterService.js';
import validateRequest from '../middleware/validate.js';
import { AppError } from '../middleware/errorHandler.js';

export const metersRouter = Router();

// Validation Schemas
const listMetersQuerySchema = z.object({
  q: z.string().trim().optional().default(''),
  page: z.coerce.number().int().min(1).default(1),
});

const meterIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Meter ID is required').regex(/^[a-zA-Z0-9_-]+$/, 'Invalid meter ID format'),
});

/**
 * GET /api/v1/meters
 * List smart meters with search and pagination
 */
metersRouter.get(
  '/meters',
  validateRequest({ query: listMetersQuerySchema }),
  async (req, res, next) => {
    try {
      const { q, page } = req.query;
      const result = await meterService.listMeters({ q, page });
      res.status(200).json({
        status: 'success',
        data: result.meters,
        pagination: result.pagination,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/meters/:id
 * Retrieve details for a specific meter
 */
metersRouter.get(
  '/meters/:id',
  validateRequest({ params: meterIdParamSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const meter = await meterService.getMeterById(id);
      if (!meter) {
        throw new AppError(`Meter with ID '${id}' not found`, 404, 'METER_NOT_FOUND');
      }
      res.status(200).json({
        status: 'success',
        data: meter,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/meters/:id/consumption
 * Retrieve consumption readings for a meter
 */
metersRouter.get(
  '/meters/:id/consumption',
  validateRequest({ params: meterIdParamSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const consumption = await meterService.getMeterConsumption(id);
      if (!consumption) {
        throw new AppError(`Consumption readings for meter '${id}' not found`, 404, 'METER_NOT_FOUND');
      }
      res.status(200).json({
        status: 'success',
        data: consumption,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default metersRouter;
