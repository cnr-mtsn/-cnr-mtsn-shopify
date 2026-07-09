import { isValidShopDomain } from '../config/shopify.js';
import logger from '../utils/logger.js';

/**
 * Authentication middleware.
 * Validates a Bearer token from Authorization and extracts the shop from the
 * x-shopify-shop header. On success, sets req.shop.
 */
export const authenticateApiToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    req.log.warn({ path: req.path }, 'Missing Authorization header');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Missing Authorization header',
    });
  }

  if (!authHeader.startsWith('Bearer ')) {
    req.log.warn({ path: req.path }, 'Invalid Authorization format');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid Authorization format. Expected: Bearer <token>',
    });
  }

  const token = authHeader.substring(7);
  const expectedToken = process.env.API_ACCESS_TOKEN;

  if (!expectedToken) {
    logger.error('API_ACCESS_TOKEN not configured in environment variables');
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'API authentication not configured',
    });
  }

  if (token !== expectedToken) {
    req.log.warn({ path: req.path }, 'Invalid API token');
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Invalid API token',
    });
  }

  const shop = req.headers['x-shopify-shop'];
  if (!shop) {
    req.log.warn({ path: req.path }, 'Missing x-shopify-shop header');
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Missing required header: x-shopify-shop',
    });
  }

  if (!isValidShopDomain(shop)) {
    req.log.warn({ shop, path: req.path }, 'Invalid shop domain');
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Invalid shop domain in x-shopify-shop header. Must be: store-name.myshopify.com',
    });
  }

  req.shop = shop;
  next();
};
