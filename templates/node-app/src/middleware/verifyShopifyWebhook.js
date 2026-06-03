import crypto from 'node:crypto';

/**
 * Verifies Shopify webhook authenticity by computing HMAC-SHA256 over the
 * exact raw request body using the app client secret, then constant-time
 * comparing against the X-Shopify-Hmac-Sha256 header.
 *
 * MUST be mounted on a router that uses express.raw({ type: 'application/json' })
 * so that req.body is a Buffer holding the bytes Shopify signed. JSON-parsing
 * the body before verification will produce a different byte sequence and
 * cause every webhook to be rejected.
 *
 * On success, attaches req.shop, req.topic, req.payload (the parsed JSON).
 */
export function verifyShopifyWebhook(req, res, next) {
  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  const shop = req.headers['x-shopify-shop-domain'];
  const topic = req.headers['x-shopify-topic'];

  if (!hmacHeader || !shop || !topic) {
    req.log?.warn?.({ shop, topic, hasHmac: !!hmacHeader }, 'Webhook missing required headers');
    return res.status(401).json({ error: 'Missing webhook headers' });
  }

  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    req.log?.error?.('SHOPIFY_CLIENT_SECRET not configured');
    return res.status(500).json({ error: 'Webhook verification not configured' });
  }

  if (!Buffer.isBuffer(req.body)) {
    req.log?.error?.('Webhook body not a Buffer — express.raw() not mounted before this middleware');
    return res.status(500).json({ error: 'Webhook body not raw' });
  }

  const computed = crypto.createHmac('sha256', secret).update(req.body).digest('base64');

  const headerBuf = Buffer.from(hmacHeader);
  const computedBuf = Buffer.from(computed);

  const valid =
    computedBuf.length === headerBuf.length && crypto.timingSafeEqual(computedBuf, headerBuf);

  if (!valid) {
    req.log?.warn?.({ shop, topic }, 'Webhook HMAC mismatch');
    return res.status(401).json({ error: 'Invalid HMAC' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch (err) {
    req.log?.warn?.({ shop, topic, err: err.message }, 'Webhook body is not valid JSON');
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  req.shop = shop;
  req.topic = topic;
  req.payload = payload;
  next();
}
