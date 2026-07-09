import express from 'express';
import { verifyShopifyWebhook } from '../middleware/verifyShopifyWebhook.js';

const router = express.Router();

// Capture raw bytes so HMAC verification can run over the exact payload Shopify
// signed. This MUST come before verifyShopifyWebhook, and this whole router MUST
// be mounted before express.json() in index.js. The default body limit (100kb)
// is below real product webhook payloads, so bump it to 5mb.
router.use(express.raw({ type: 'application/json', limit: '5mb' }));
router.use(verifyShopifyWebhook);

/**
 * Generic webhook handler. Shopify retries any webhook that takes >5s, so ack
 * immediately, then do the real work. req.shop / req.topic / req.payload are
 * populated by verifyShopifyWebhook.
 */
function handleWebhook(req, res) {
  res.status(200).end();
  req.log.info({ shop: req.shop, topic: req.topic }, 'Webhook received');
  // TODO: handle req.payload for this topic.
}

router.post('/products/create', handleWebhook);
router.post('/products/update', handleWebhook);

export default router;
