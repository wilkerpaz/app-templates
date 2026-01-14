import {
  Router,
  type Request,
  type Response,
  type Router as RouterType,
} from 'express';
import { isDatabaseAvailable } from '@chat-template/db';

export const configRouter: RouterType = Router();

/**
 * GET /api/config - Get application configuration
 * Returns feature flags based on environment configuration
 */
configRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    features: {
      chatHistory: isDatabaseAvailable(),
    },
    servingEndpoint: process.env.DATABRICKS_SERVING_ENDPOINT || 'Endpoint Desconhecido',
    servingExperiment: process.env.DATABRICKS_SERVING_EXPERIMENT || 'Experimento Desconhecido',
  });
});
