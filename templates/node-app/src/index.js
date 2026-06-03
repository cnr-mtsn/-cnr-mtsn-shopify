import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pinoHttp from 'pino-http';
import logger from './utils/logger.js';
import healthRoutes from './routes/health.js';
import webhookRoutes from './routes/webhooks.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS — allow server-to-server (no origin) plus Shopify domains. Add your own
// storefront/app domain(s) to the allowlist below.
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = [
        // TODO: add your storefront/app domain, e.g. 'https://your-store.myshopify.com'
        /\.myshopify\.com$/,
        /\.shopify\.com$/,
        /\.trycloudflare\.com$/,
      ];
      if (!origin || allowed.some((o) => (o instanceof RegExp ? o.test(origin) : o === origin))) {
        callback(null, true);
      } else {
        callback(new Error(`CORS not allowed for origin: ${origin}`));
      }
    },
    allowedHeaders: ['Content-Type', 'Authorization', 'x-shopify-shop'],
  })
);

// Structured request/response logging — mounted before any router so req.log is
// available everywhere. pino-http only hooks res.end; it doesn't read the body,
// so it's safe to mount before express.raw() runs inside the webhooks router.
app.use(
  pinoHttp({
    logger,
    customSuccessMessage: (req, res) => `${req.method} ${req.url} completed`,
    customErrorMessage: (req, res, err) => `${req.method} ${req.url} failed`,
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          query: req.query,
          shop: req.headers?.['x-shopify-shop'],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
    customProps: (req, res) => {
      const props = {};
      if (res.statusCode >= 400) props.requestBody = req.body;
      return props;
    },
  })
);

// Webhooks must be mounted BEFORE express.json() so HMAC verification can run
// over the raw request body. The webhooks router applies express.raw() itself.
app.use('/webhooks', webhookRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/health', healthRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: '{{APP_NAME}} — Shopify Node/Express app', version: '1.0.0' });
});

// 404 handler
app.use((req, res) => {
  req.log.warn({ method: req.method, path: req.path }, 'Route not found');
  res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.path} not found` });
});

// Error handler
app.use((err, req, res, next) => {
  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Start server
app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, '{{APP_NAME}} started');
});
