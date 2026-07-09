import express from 'express';
import { shopify } from '../config/shopify.js';

const router = express.Router();

/**
 * GET /health — service + configuration status.
 */
router.get('/', async (req, res) => {
  try {
    const hasRequiredEnv = !!(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);

    const status = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      authType: 'Client Credentials Grant',
      configurationComplete: hasRequiredEnv,
      apiVersion: shopify.config.apiVersion,
    };

    if (!hasRequiredEnv) {
      status.status = 'degraded';
      status.warning =
        'Missing required environment variables: SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET';
    }

    res.json(status);
  } catch (error) {
    req.log.error({ err: error }, 'Health check error');
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

export default router;
