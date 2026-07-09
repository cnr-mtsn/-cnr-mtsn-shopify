# Shopify CLI Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **PROJECT RULE (overrides skill defaults):** This repo's `CLAUDE.md` says **do NOT run `git commit`** (or `git add`). The user drives commits. Every "Commit" step below is therefore replaced by **"STOP — leave files written, do not run git."** Report what changed and suggest a commit subject instead.

**Goal:** Add two zero-dependency CommonJS bins to the `@cnr-mtsn/shopify` package — `shopify-init` (Node port of a Shopify theme dev-setup script) and `shopify-create-node-app` (scaffolds a Shopify Node/Express app into the current directory from a template tree).

**Architecture:** Both generators are CommonJS, use only Node built-ins (preserving the package's zero-dep identity), and expose pure helper/core functions (no prompts, no `process.exit`) that are unit-tested with the built-in `node:test` runner; thin `main()` wrappers handle interactivity behind `if (require.main === module)`. The scaffolder copies a real `templates/node-app/` tree (dotfiles stored un-dotted to survive npm's `.gitignore`→`.npmignore` rename) and substitutes a `{{APP_NAME}}` token. The *generated app* is ESM with its own dependencies, distilled from `blueswitch/node-apps/tyr` with three deliberate fixes (optional `SHOPIFY_ACCESS_SCOPES`, valid `cors` version, generic CORS allowlist).

**Tech Stack:** Node.js ≥18 (built-ins: `fs`, `path`, `readline`, `child_process`, `node:test`, `node:assert`). Generated app: Express 4, `@shopify/shopify-api` 11, `pino`/`pino-http`, `cors`, `dotenv`.

**Package root (all paths absolute):** `/Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/extensions-migration`

---

## File Structure

**New files in the package:**
- `init-shopify.js` — bin `shopify-init`. Helpers: `isThemeDir`, `normalizeStore`, `setupThemeDev`; `main()` wrapper.
- `create-node-app.js` — bin `shopify-create-node-app`. Helpers: `sanitizeAppName`, `destRelPath`, `listFiles`, `scaffoldNodeApp`; `main()` wrapper.
- `templates/node-app/**` — the ESM app skeleton (see Task 2 for the full tree + contents).
- `test/init-shopify.test.js` — unit + integration tests for `init-shopify.js`.
- `test/create-node-app.test.js` — unit + integration tests for `create-node-app.js`.

**Modified files:**
- `package.json` — add 2 bins, `test` script, keywords, bump to `2.1.0`, refresh description.
- `README.md` — add a usage section per new command.

---

## Task 1: `init-shopify.js` (bin `shopify-init`)

**Files:**
- Create: `/Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/extensions-migration/init-shopify.js`
- Test: `/Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/extensions-migration/test/init-shopify.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/init-shopify.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { isThemeDir, normalizeStore, setupThemeDev } = require("../init-shopify.js");

const THEME_DIRS = ["assets", "config", "layout", "locales", "sections", "snippets", "templates"];

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cnr-init-test-"));
}

function makeThemeDir() {
  const dir = tmpDir();
  for (const d of THEME_DIRS) fs.mkdirSync(path.join(dir, d));
  return dir;
}

test("normalizeStore appends .myshopify.com when missing", () => {
  assert.strictEqual(normalizeStore("acme"), "acme.myshopify.com");
});

test("normalizeStore leaves a full domain untouched", () => {
  assert.strictEqual(normalizeStore("acme.myshopify.com"), "acme.myshopify.com");
});

test("normalizeStore trims whitespace", () => {
  assert.strictEqual(normalizeStore("  acme  "), "acme.myshopify.com");
});

test("isThemeDir is false unless all 7 theme dirs exist", () => {
  const dir = tmpDir();
  assert.strictEqual(isThemeDir(dir), false);
  fs.mkdirSync(path.join(dir, "assets"));
  assert.strictEqual(isThemeDir(dir), false);
  for (const d of THEME_DIRS) fs.mkdirSync(path.join(dir, d), { recursive: true });
  assert.strictEqual(isThemeDir(dir), true);
});

test("setupThemeDev writes dev script, .gitignore, .shopifyignore", () => {
  const dir = makeThemeDir();
  const store = setupThemeDev({ cwd: dir, storeName: "acme" });
  assert.strictEqual(store, "acme.myshopify.com");

  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  assert.match(pkg.scripts.dev, /shopify theme dev --store=acme\.myshopify\.com --host=localhost --port=3000/);

  assert.strictEqual(
    fs.readFileSync(path.join(dir, ".gitignore"), "utf8"),
    "package.json\npackage-lock.json\nnode_modules\n.claude\n.shopifyignore\n"
  );
  assert.strictEqual(
    fs.readFileSync(path.join(dir, ".shopifyignore"), "utf8"),
    "package.json\n.claude\n.gitignore\n"
  );
});

test("setupThemeDev removes pre-existing npm artifacts", () => {
  const dir = makeThemeDir();
  fs.writeFileSync(path.join(dir, "package-lock.json"), "{}");
  fs.mkdirSync(path.join(dir, "node_modules"));
  fs.writeFileSync(path.join(dir, "node_modules", "x.txt"), "x");
  setupThemeDev({ cwd: dir, storeName: "acme" });
  assert.strictEqual(fs.existsSync(path.join(dir, "package-lock.json")), false);
  assert.strictEqual(fs.existsSync(path.join(dir, "node_modules")), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/extensions-migration && node --test test/init-shopify.test.js`
Expected: FAIL — `Cannot find module '../init-shopify.js'`.

- [ ] **Step 3: Write the implementation**

Create `init-shopify.js`:

```js
#!/usr/bin/env node
// init-shopify.js — Shopify theme dev setup (zero-dependency Node port of the
// original Bash `init-shopify`). Verifies a theme folder, writes a package.json
// dev script + .gitignore + .shopifyignore, and optionally starts the dev server.
// No `jq` required; runs on macOS / Linux / Windows.

"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

// ANSI styling
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const THEME_DIRS = ["assets", "config", "layout", "locales", "sections", "snippets", "templates"];

/** True only when `cwd` contains all 7 Shopify theme directories. */
function isThemeDir(cwd) {
  return THEME_DIRS.every((dir) => {
    try {
      return fs.statSync(path.join(cwd, dir)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Append `.myshopify.com` if the store wasn't given as a full domain. */
function normalizeStore(input) {
  const store = String(input).trim();
  return store.endsWith(".myshopify.com") ? store : `${store}.myshopify.com`;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    })
  );
}

/**
 * Write the theme dev files into `cwd`. Pure filesystem work — no prompts.
 * Replaces the original's `npm init -y` + `jq` with a direct package.json write.
 * @returns {string} the resolved store domain
 */
function setupThemeDev({ cwd, storeName }) {
  const store = normalizeStore(storeName);

  // Clean any pre-existing npm artifacts
  for (const artifact of ["node_modules", "package.json", "package-lock.json"]) {
    fs.rmSync(path.join(cwd, artifact), { recursive: true, force: true });
  }

  const pkg = {
    name: path.basename(cwd),
    version: "1.0.0",
    scripts: {
      dev: `shopify theme dev --store=${store} --host=localhost --port=3000`,
    },
  };
  fs.writeFileSync(path.join(cwd, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  fs.writeFileSync(
    path.join(cwd, ".gitignore"),
    "package.json\npackage-lock.json\nnode_modules\n.claude\n.shopifyignore\n"
  );
  fs.writeFileSync(
    path.join(cwd, ".shopifyignore"),
    "package.json\n.claude\n.gitignore\n"
  );

  return store;
}

async function main() {
  const cwd = process.cwd();

  if (!isThemeDir(cwd)) {
    process.stdout.write(
      `\n  ${RED}${BOLD}Error:${RESET} Not a Shopify theme folder.\n` +
        `  ${DIM}Run this from the root of your Shopify theme.${RESET}\n\n`
    );
    process.exit(1);
  }

  process.stdout.write(`\n  ${BOLD}Shopify Dev Setup${RESET}\n`);
  process.stdout.write(`  ${DIM}─────────────────────────────────────${RESET}\n\n`);

  const storeInput = await prompt(`  Store ${DIM}(name or full .myshopify.com URL)${RESET}: `);
  const store = setupThemeDev({ cwd, storeName: storeInput });

  process.stdout.write(`\n  ${GREEN}✓${RESET} Initialized package.json\n`);
  process.stdout.write(`  ${GREEN}✓${RESET} Added dev script ${DIM}→ ${store}${RESET}\n`);
  process.stdout.write(`  ${GREEN}✓${RESET} Created .gitignore\n`);
  process.stdout.write(`  ${GREEN}✓${RESET} Created .shopifyignore\n`);

  process.stdout.write(`\n  ${DIM}─────────────────────────────────────${RESET}\n`);
  process.stdout.write(
    `  ${GREEN}${BOLD}Ready!${RESET} ${DIM}Run${RESET} npm run dev ${DIM}to start the server.${RESET}\n\n`
  );

  const startServer = await prompt(`  Start dev server now? ${DIM}(y/n)${RESET} `);
  if (startServer.trim().toLowerCase() === "y") {
    process.stdout.write(`\n  ${CYAN}${BOLD}Starting dev server...${RESET}\n\n`);
    execSync("npm run dev", { stdio: "inherit", cwd });
  } else {
    process.stdout.write(`\n  ${DIM}See you later!${RESET}\n\n`);
  }
}

module.exports = { isThemeDir, normalizeStore, setupThemeDev };

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`\n  ${RED}${BOLD}Error:${RESET} ${err.message}\n\n`);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/extensions-migration && node --test test/init-shopify.test.js`
Expected: PASS — all tests pass (6 tests).

- [ ] **Step 5: Make the bin executable**

Run: `chmod +x /Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/extensions-migration/init-shopify.js`

- [ ] **Step 6: STOP — do not commit**

Per project `CLAUDE.md`, do not run `git add`/`git commit`. Leave files written and report.

---

## Task 2: Template tree `templates/node-app/**`

**Files (all under** `/Users/cnrmtsn/.../extensions-migration/templates/node-app/`**):**
- Create: `src/index.js`, `src/config/shopify.js`, `src/middleware/auth.js`, `src/middleware/verifyShopifyWebhook.js`, `src/routes/health.js`, `src/routes/webhooks.js`, `src/services/.gitkeep`, `src/utils/logger.js`, `src/utils/shopify.js`, `scripts/.gitkeep`, `gitignore`, `env`, `env.example`, `package.json`, `README.md`

> These are distilled from `tyr` with three deliberate fixes called out inline: optional `SHOPIFY_ACCESS_SCOPES`, valid `cors` version (`^2.8.5`), and a generic CORS allowlist. Dotfiles are stored **un-dotted** (`gitignore`/`env`/`env.example`) on purpose. `{{APP_NAME}}` is the substitution token.

- [ ] **Step 1: Create `src/utils/logger.js`**

```js
import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  ...(isProduction
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true } } }
  ),
});

export default logger;
```

- [ ] **Step 2: Create `src/utils/shopify.js`**

```js
export const toGid = (type, id) => {
  return `gid://shopify/${type.charAt(0).toUpperCase() + type.slice(1)}/${id}`;
};
```

- [ ] **Step 3: Create `src/config/shopify.js`** (FIX: optional scopes)

```js
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
```

- [ ] **Step 4: Create `src/middleware/auth.js`**

```js
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
```

- [ ] **Step 5: Create `src/middleware/verifyShopifyWebhook.js`** (verbatim from reference)

```js
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
```

- [ ] **Step 6: Create `src/routes/health.js`**

```js
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
```

- [ ] **Step 7: Create `src/routes/webhooks.js`** (minimal, demonstrates the pattern)

```js
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
```

- [ ] **Step 8: Create `src/index.js`** (generic CORS, only /health + /webhooks mounted)

```js
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
```

- [ ] **Step 9: Create `src/services/.gitkeep` and `scripts/.gitkeep`** (empty files)

Both files are empty. They preserve the empty `services/` and `scripts/` directories in the scaffolded app.

- [ ] **Step 10: Create `package.json`** (the template app manifest — FIX: `cors ^2.8.5`)

```json
{
  "name": "{{APP_NAME}}",
  "version": "1.0.0",
  "description": "Shopify Node/Express app",
  "main": "src/index.js",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "keywords": [
    "shopify",
    "express"
  ],
  "license": "ISC",
  "dependencies": {
    "@shopify/shopify-api": "^11.7.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.18.2",
    "pino": "^10.3.1",
    "pino-http": "^11.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.11",
    "pino-pretty": "^13.1.3"
  }
}
```

- [ ] **Step 11: Create `gitignore`** (written as `.gitignore` in the scaffolded app)

```text
# Dependencies
node_modules/

# Environment variables
.env

# Logs
logs/
*.log

# OS files
.DS_Store
```

- [ ] **Step 12: Create `env.example`** (written as `.env.example`)

```text
# Environment Configuration
NODE_ENV=development

# Shopify App Credentials (from Partner Dashboard)
# https://partners.shopify.com → Your App → Configuration → API credentials
SHOPIFY_CLIENT_ID=your_client_id_here
SHOPIFY_CLIENT_SECRET=your_client_secret_here

# Shopify Shop Domain (optional — used by one-off scripts)
SHOPIFY_SHOP=your-store.myshopify.com

# Optional: comma-separated access scopes. Only needed for OAuth-style flows;
# Client Credentials Grant uses the app's configured scopes.
# SHOPIFY_ACCESS_SCOPES=read_products,write_products

# Server Configuration
PORT=3000

# Optional: log level (defaults to debug in dev, info in production)
# LOG_LEVEL=debug

# API Authentication — generate with: openssl rand -base64 32
API_ACCESS_TOKEN=your_secure_api_token_here
```

- [ ] **Step 13: Create `env`** (written as `.env`) — identical content to `env.example`

Same exact content as Step 12.

- [ ] **Step 14: Create `README.md`** (token-substituted)

````markdown
# {{APP_NAME}}

A Shopify Node/Express app that talks to the Admin GraphQL API via the Client
Credentials Grant.

## Setup

```bash
npm install
cp .env.example .env   # then fill in your credentials
npm run dev
```

## Environment

Set these in `.env` (see `.env.example`):

- `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` — from the Partner Dashboard
- `API_ACCESS_TOKEN` — Bearer token protecting authenticated routes
- `PORT` — defaults to 3000

## Endpoints

- `GET /health` — service + configuration status
- `POST /webhooks/products/create`, `POST /webhooks/products/update` — HMAC-verified Shopify webhooks

## Structure

```text
src/
  config/      Shopify Admin GraphQL client (Client Credentials Grant)
  middleware/  auth (Bearer) + Shopify webhook HMAC verification
  routes/      Express routers (health, webhooks)
  services/    business logic / GraphQL calls
  utils/       logger (pino) + helpers
scripts/       one-off scripts run manually (not part of the running app)
```
````

- [ ] **Step 15: Validate every generated `.js` template parses**

Run:
```bash
cd /Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/extensions-migration/templates/node-app
for f in $(find src -name '*.js'); do node --check "$f" && echo "ok: $f"; done
```
Expected: `ok:` printed for all 8 `.js` files, no syntax errors. (Note: `--check` validates ESM syntax without resolving imports.)

- [ ] **Step 16: STOP — do not commit**

---

## Task 3: `create-node-app.js` (bin `shopify-create-node-app`)

**Files:**
- Create: `/Users/cnrmtsn/.../extensions-migration/create-node-app.js`
- Test: `/Users/cnrmtsn/.../extensions-migration/test/create-node-app.test.js`

**Depends on Task 2** (templates must exist for the integration tests).

- [ ] **Step 1: Write the failing test**

Create `test/create-node-app.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { sanitizeAppName, destRelPath, scaffoldNodeApp } = require("../create-node-app.js");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cnr-scaffold-test-"));
}

test("sanitizeAppName lowercases and dashes non-name chars", () => {
  assert.strictEqual(sanitizeAppName("My App"), "my-app");
  assert.strictEqual(sanitizeAppName("Acme/Co!"), "acme-co");
});

test("sanitizeAppName falls back when empty", () => {
  assert.strictEqual(sanitizeAppName("   "), "shopify-app");
});

test("destRelPath renames stored dotfiles only", () => {
  assert.strictEqual(destRelPath("gitignore"), ".gitignore");
  assert.strictEqual(destRelPath("env"), ".env");
  assert.strictEqual(destRelPath("env.example"), ".env.example");
  assert.strictEqual(destRelPath(path.join("src", "index.js")), path.join("src", "index.js"));
});

test("scaffoldNodeApp writes the tree, renames dotfiles, substitutes name", () => {
  const dir = tmpDir();
  const written = scaffoldNodeApp({ cwd: dir, appName: "My App" });

  // dotfiles renamed
  assert.ok(fs.existsSync(path.join(dir, ".gitignore")));
  assert.ok(fs.existsSync(path.join(dir, ".env")));
  assert.ok(fs.existsSync(path.join(dir, ".env.example")));
  assert.ok(!fs.existsSync(path.join(dir, "gitignore")));
  assert.ok(!fs.existsSync(path.join(dir, "env")));

  // key tree
  for (const rel of [
    "src/index.js",
    "src/config/shopify.js",
    "src/middleware/auth.js",
    "src/middleware/verifyShopifyWebhook.js",
    "src/routes/health.js",
    "src/routes/webhooks.js",
    "src/services/.gitkeep",
    "src/utils/logger.js",
    "src/utils/shopify.js",
    "scripts/.gitkeep",
    "package.json",
    "README.md",
  ]) {
    assert.ok(fs.existsSync(path.join(dir, rel)), `missing ${rel}`);
  }

  // token substitution
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  assert.strictEqual(pkg.name, "my-app");
  assert.strictEqual(pkg.type, "module");
  assert.strictEqual(pkg.dependencies.cors, "^2.8.5");
  const index = fs.readFileSync(path.join(dir, "src", "index.js"), "utf8");
  assert.ok(index.includes("my-app"));
  assert.ok(!index.includes("{{APP_NAME}}"));

  // the scopes fix is present
  const cfg = fs.readFileSync(path.join(dir, "src", "config", "shopify.js"), "utf8");
  assert.match(cfg, /SHOPIFY_ACCESS_SCOPES \|\| ''/);

  // return value lists destination-relative paths
  assert.ok(written.includes(".gitignore"));
  assert.ok(written.includes(path.join("src", "index.js")));
});

test("scaffoldNodeApp refuses to overwrite existing files", () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
  assert.throws(
    () => scaffoldNodeApp({ cwd: dir, appName: "x" }),
    /Refusing to overwrite/
  );
  // the pre-existing file is untouched
  assert.strictEqual(fs.readFileSync(path.join(dir, "package.json"), "utf8"), "{}");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/cnrmtsn/.../extensions-migration && node --test test/create-node-app.test.js`
Expected: FAIL — `Cannot find module '../create-node-app.js'`.

- [ ] **Step 3: Write the implementation**

Create `create-node-app.js`:

```js
#!/usr/bin/env node
// create-node-app.js — scaffold a Shopify Node/Express app into the current
// directory from templates/node-app. Zero-dependency. Dotfiles are stored
// un-dotted in the template (npm renames a literal .gitignore to .npmignore on
// publish) and are renamed back when written into the target app.

"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

const TEMPLATE_DIR = path.join(__dirname, "templates", "node-app");

// Template basenames that must be renamed when written into the target app.
const DOTFILE_RENAMES = {
  gitignore: ".gitignore",
  env: ".env",
  "env.example": ".env.example",
};

/** Reduce arbitrary input to a valid-ish npm package name; fallback if empty. */
function sanitizeAppName(input) {
  const name = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_.]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return name || "shopify-app";
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    })
  );
}

/** Recursively list files under `dir`, as paths relative to `base`. */
function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

/** Map a template-relative path to its destination, applying dotfile renames to the basename. */
function destRelPath(relPath) {
  const dir = path.dirname(relPath);
  const baseName = path.basename(relPath);
  const renamed = DOTFILE_RENAMES[baseName] || baseName;
  return dir === "." ? renamed : path.join(dir, renamed);
}

/**
 * Scaffold the app into `cwd`. Throws (err.collisions set) if any destination
 * file already exists — never overwrites. Returns the destination-relative paths written.
 */
function scaffoldNodeApp({ cwd, appName, templateDir = TEMPLATE_DIR }) {
  const plan = listFiles(templateDir).map((rel) => {
    const destRel = destRelPath(rel);
    return { src: path.join(templateDir, rel), destRel, dest: path.join(cwd, destRel) };
  });

  const collisions = plan.filter((p) => fs.existsSync(p.dest)).map((p) => p.destRel);
  if (collisions.length > 0) {
    const err = new Error(`Refusing to overwrite existing files: ${collisions.join(", ")}`);
    err.collisions = collisions;
    throw err;
  }

  const safeName = sanitizeAppName(appName);
  for (const p of plan) {
    fs.mkdirSync(path.dirname(p.dest), { recursive: true });
    const content = fs.readFileSync(p.src, "utf8").split("{{APP_NAME}}").join(safeName);
    fs.writeFileSync(p.dest, content);
  }

  return plan.map((p) => p.destRel);
}

async function main() {
  const cwd = process.cwd();
  const defaultName = sanitizeAppName(path.basename(cwd));

  process.stdout.write(`\n  ${BOLD}Create Shopify Node App${RESET}\n`);
  process.stdout.write(`  ${DIM}─────────────────────────────────────${RESET}\n\n`);

  const nameInput = await prompt(`  App name ${DIM}(default: ${defaultName})${RESET}: `);
  const appName = nameInput.trim() ? sanitizeAppName(nameInput) : defaultName;

  let written;
  try {
    written = scaffoldNodeApp({ cwd, appName });
  } catch (err) {
    if (err.collisions) {
      process.stdout.write(`\n  ${RED}${BOLD}Error:${RESET} ${err.message}\n\n`);
      process.exit(1);
    }
    throw err;
  }

  process.stdout.write(
    `\n  ${GREEN}✓${RESET} Scaffolded ${written.length} files into ${DIM}${cwd}${RESET}\n`
  );
  process.stdout.write(`\n  ${DIM}─────────────────────────────────────${RESET}\n`);
  process.stdout.write(`  ${BOLD}Next steps:${RESET}\n`);
  process.stdout.write(`    ${DIM}1.${RESET} npm install\n`);
  process.stdout.write(`    ${DIM}2.${RESET} Edit .env with your Shopify credentials\n`);
  process.stdout.write(`    ${DIM}3.${RESET} npm run dev ${DIM}→ GET /health${RESET}\n\n`);
}

module.exports = { sanitizeAppName, destRelPath, listFiles, scaffoldNodeApp };

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`\n  ${RED}${BOLD}Error:${RESET} ${err.message}\n\n`);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/cnrmtsn/.../extensions-migration && node --test test/create-node-app.test.js`
Expected: PASS — all tests pass (5 tests).

- [ ] **Step 5: Make the bin executable**

Run: `chmod +x /Users/cnrmtsn/.../extensions-migration/create-node-app.js`

- [ ] **Step 6: STOP — do not commit**

---

## Task 4: Wire bins, scripts, keywords, version, README

**Files:**
- Modify: `/Users/cnrmtsn/.../extensions-migration/package.json`
- Modify: `/Users/cnrmtsn/.../extensions-migration/README.md`

- [ ] **Step 1: Replace `package.json`** with the updated manifest

Full new content:

```json
{
  "name": "@cnr-mtsn/shopify",
  "version": "2.1.0",
  "description": "Shopify developer CLI suite — extension migration, theme dev setup, and Node/Express app scaffolding",
  "bin": {
    "shopify-migrate": "migrate-extensions.js",
    "shopify-init": "init-shopify.js",
    "shopify-create-node-app": "create-node-app.js"
  },
  "scripts": {
    "migrate": "node migrate-extensions.js",
    "migrate:dry-run": "node migrate-extensions.js --dry-run",
    "test": "node --test test/*.test.js"
  },
  "keywords": [
    "shopify",
    "extensions",
    "migration",
    "functions",
    "checkout",
    "preact",
    "polaris",
    "scaffold",
    "express",
    "theme",
    "node"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/cnr-mtsn/shopify-migrate"
  },
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 2: Verify `npm test` runs the suite**

Run: `cd /Users/cnrmtsn/.../extensions-migration && npm test`
Expected: all tests across both test files pass (11 total).

- [ ] **Step 3: Add README sections** for the two new commands

In `README.md`, after the existing Installation/Usage material, add a "## CLI Tools" section (or extend Usage) containing:

````markdown
## CLI Tools

This package ships three bins. Run any of them with `npx @cnr-mtsn/shopify <command>` or after a global install (`npm i -g @cnr-mtsn/shopify`).

### `shopify-migrate`

Migrate Shopify Functions and UI Extensions to the latest API version (see above).

### `shopify-init`

Set up a Shopify **theme** for local development. Run it from the root of a theme
folder; it writes a `package.json` `dev` script, `.gitignore`, and `.shopifyignore`,
then optionally starts `shopify theme dev`.

```bash
cd my-theme
npx @cnr-mtsn/shopify shopify-init
```

### `shopify-create-node-app`

Scaffold a Shopify **Node/Express** app into the current directory — Admin
GraphQL client (Client Credentials Grant), pino logging, webhook HMAC
verification, Bearer auth, and a working `/health` route.

```bash
mkdir my-app && cd my-app
npx @cnr-mtsn/shopify shopify-create-node-app
npm install
npm run dev   # GET /health
```
````

- [ ] **Step 4: STOP — do not commit**

---

## Task 5: End-to-end verification (publish-readiness)

**Files:** none created — this task only runs commands and reports.

- [ ] **Step 1: Full test suite**

Run: `cd /Users/cnrmtsn/.../extensions-migration && npm test`
Expected: all tests pass.

- [ ] **Step 2: Exercise `shopify-init` against a fake theme**

```bash
T=$(mktemp -d)
mkdir -p "$T"/{assets,config,layout,locales,sections,snippets,templates}
( cd "$T" && printf 'acme\nn\n' | node /Users/cnrmtsn/.../extensions-migration/init-shopify.js )
cat "$T/package.json"; echo "---"; cat "$T/.gitignore"; echo "---"; cat "$T/.shopifyignore"
```
Expected: `package.json` `dev` script targets `acme.myshopify.com`; both ignore files present; the `n` answer skips starting the server.

Then confirm the non-theme guard:
```bash
T2=$(mktemp -d)
( cd "$T2" && node /Users/cnrmtsn/.../extensions-migration/init-shopify.js ); echo "exit=$?"
```
Expected: prints "Not a Shopify theme folder." and `exit=1`.

- [ ] **Step 3: Exercise `shopify-create-node-app` and boot the app**

```bash
A=$(mktemp -d)
( cd "$A" && printf 'demo-app\n' | node /Users/cnrmtsn/.../extensions-migration/create-node-app.js )
find "$A" -maxdepth 3 -not -path '*/node_modules/*' | sort
```
Expected: full tree with `.gitignore`/`.env`/`.env.example` (not `gitignore`/`env`), `src/...`, `scripts/.gitkeep`.

Then install + boot (requires network for `npm install`):
```bash
( cd "$A" && npm install --no-audit --no-fund \
  && (node src/index.js & SVR=$!; sleep 2; \
      curl -s localhost:3000/health; echo; \
      kill $SVR) )
```
Expected: `/health` returns JSON with `"status":"degraded"` (no creds set) and NO crash about `SHOPIFY_ACCESS_SCOPES` — proves the scopes fix.

> If `npm install` can't reach the network in this environment, fall back to network-free validation: `for f in $(find "$A/src" -name '*.js'); do node --check "$f"; done` and rely on Step 1's tests. Report clearly that the live boot was skipped for network reasons.

- [ ] **Step 4: Confirm collision-safety**

```bash
( cd "$A" && node /Users/cnrmtsn/.../extensions-migration/create-node-app.js < /dev/null ); echo "exit=$?"
```
Expected: prints "Refusing to overwrite existing files: ..." and `exit=1`; existing files unchanged.

- [ ] **Step 5: `npm pack` dry-run — confirm publish contents**

Run: `cd /Users/cnrmtsn/.../extensions-migration && npm pack --dry-run 2>&1 | grep -E 'templates/node-app|init-shopify.js|create-node-app.js|migrate-extensions.js'`
Expected: the tarball lists `init-shopify.js`, `create-node-app.js`, `migrate-extensions.js`, and the `templates/node-app/**` files **including** `templates/node-app/gitignore` and `templates/node-app/env` (stored un-dotted, so they ship correctly).

- [ ] **Step 6: STOP — report publish-readiness**

Summarize: tests passing, both generators exercised, app boots, pack contents correct. Suggest commit subject `feat: add shopify-init and shopify-create-node-app CLI tools` and the publish command `npm publish --access public` (user runs it).

---

## Self-Review (completed by plan author)

**Spec coverage:** `shopify-init` (Task 1) ✓; template tree incl. webhooks + scopes fix + cors fix (Task 2) ✓; `shopify-create-node-app` current-dir + collision-safe + dotfile rename + token (Task 3) ✓; manifest bins/version/keywords + README (Task 4) ✓; verification incl. pack dry-run (Task 5) ✓. "Print, don't run, npm install" honored in Task 3 main(). Webhooks included per decision.

**Placeholder scan:** Only intentional in-template `// TODO` markers (CORS domain, webhook payload handling) — these are starter-app guidance, not plan gaps. No TBDs in plan steps.

**Type/name consistency:** `isThemeDir`/`normalizeStore`/`setupThemeDev` exported by `init-shopify.js` and imported identically in its test. `sanitizeAppName`/`destRelPath`/`listFiles`/`scaffoldNodeApp` exported by `create-node-app.js` and imported identically in its test. `{{APP_NAME}}` token and `DOTFILE_RENAMES` keys consistent between Task 2 contents and Task 3 logic. `cors ^2.8.5` asserted in test and present in template.

**Project rule:** every commit step replaced with STOP/no-git per `CLAUDE.md`.
