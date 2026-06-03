import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET'];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

// Optional scopes. Client Credentials Grant uses the app's configured scopes,
// so this can be left unset — unlike the reference app, we guard against the
// env var being absent instead of crashing on `.split` of undefined.
const scopes = (process.env.SHOPIFY_ACCESS_SCOPES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Initialize Shopify API
export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_CLIENT_ID,
  apiSecretKey: process.env.SHOPIFY_CLIENT_SECRET,
  scopes,
  hostName: 'not-required-for-client-credentials.myshopify.com',
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
});

// Token cache: { shop: { token, expiresAt } }
const tokenCache = new Map();

/**
 * Get an access token for a shop using Client Credentials Grant.
 * Caches and refreshes automatically.
 * @param {string} shop - e.g. 'store.myshopify.com'
 * @returns {Promise<string>}
 */
export async function getAccessToken(shop) {
  const cached = tokenCache.get(shop);
  if (cached && cached.expiresAt > new Date()) {
    logger.debug({ shop }, 'Using cached access token');
    return cached.token;
  }

  logger.info({ shop }, 'Requesting new access token');

  try {
    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const error = new Error(`Failed to get access token: ${response.status}`);
      error.statusCode = response.status;
      error.responseBody = errorText;
      error.isHtml =
        errorText.trim().startsWith('<!DOCTYPE') || errorText.trim().startsWith('<html');
      throw error;
    }

    const data = await response.json();
    const { access_token, expires_in } = data;

    // subtract 5 minutes for a safety margin
    const expiresAt = new Date(Date.now() + (expires_in - 300) * 1000);
    tokenCache.set(shop, { token: access_token, expiresAt });

    logger.info({ shop, expiresAt: expiresAt.toISOString() }, 'Access token obtained');
    return access_token;
  } catch (error) {
    logger.error({ err: error, shop }, 'Failed to get access token');
    error.shopifyError = true;
    throw error;
  }
}

/**
 * Create an authenticated GraphQL client for a shop.
 * @param {string} shop
 * @returns {Promise<object>}
 */
export async function createGraphQLClient(shop) {
  const accessToken = await getAccessToken(shop);
  const session = shopify.session.customAppSession(shop);
  session.accessToken = accessToken;
  return new shopify.clients.Graphql({ session });
}

/**
 * Validate shop domain format.
 * @param {string} shop
 * @returns {boolean}
 */
export function isValidShopDomain(shop) {
  if (!shop) return false;
  return /^[a-z0-9][a-z0-9\-]*\.myshopify\.com$/.test(shop);
}
