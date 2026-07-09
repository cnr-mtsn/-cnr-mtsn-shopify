# Design: Add `shopify-init` and `shopify-create-node-app` to `@cnr-mtsn/shopify`

- **Date:** 2026-06-02
- **Package:** `@cnr-mtsn/shopify` (v2.0.6 → 2.1.0), root at `tools/npm-packages/cnr-mtsn-shopify/extensions-migration/`
- **Status:** Approved (design); pending implementation plan

## Goal

Grow the existing single-tool package (`shopify-migrate`) into a small multi-tool
Shopify CLI suite by adding two new bins, runnable via `npx @cnr-mtsn/shopify <cmd>`
or a global install:

1. **`shopify-init`** — a Node port of the user's existing `init-shopify` Bash
   script (Shopify *theme* dev setup). No `jq`, cross-platform.
2. **`shopify-create-node-app`** — scaffolds a Shopify Node/Express app into the
   current directory, distilled from the reference app at
   `blueswitch/node-apps/tyr`.

## Constraints / context

- The package is **CommonJS** and **zero-dependency** (Node built-ins only) — a
  stated selling point in its README. Both new generators MUST preserve this:
  CommonJS, no runtime deps, `#!/usr/bin/env node` shebang.
- The *app generated* by `shopify-create-node-app` is **ESM**
  (`"type": "module"`) with its own `package.json` dependencies. Keep the
  producer (CJS) / consumer (ESM) split straight.
- Publishing: no `.npmignore`, no `files` field. npm publishes everything not in
  `.gitignore` (currently only `.claude`, `old-api-version`, `latest-api-version`).
  A new `templates/` dir publishes automatically — no manifest change needed for it.
- **npm dotfile gotcha:** npm renames a literal `.gitignore` inside a package to
  `.npmignore` on publish. Template dotfiles MUST therefore be stored **un-dotted**
  (`gitignore`, `env`, `env.example`) and renamed when written into the user's app.
- User's `CLAUDE.md`: do **not** run `git commit` — stop at file writes and suggest
  a subject line. Subdirectories are independent repos.

## Decisions (resolved with the user)

| Question | Decision |
|---|---|
| `init-shopify` ship format | **Port to Node.js** (zero-dep, no `jq`) |
| Command names | **`shopify-init`** and **`shopify-create-node-app`** |
| Scaffolder depth | **Batteries-included** (working boilerplate, not bare folders) |
| Scaffolder target | **Current directory** (like `init-shopify`) |
| Include `routes/webhooks.js` | **Yes** (so webhook middleware + body-ordering aren't dead code) |
| Auto-run `npm install` | **No** — just print the command |
| Template strategy | **Template directory + tiny generators** (Approach 1) |

### Template strategy rationale

Real template files (copied at runtime) beat embedded JS string literals because
`config/shopify.js` and any GraphQL service use backticks and `${}`; embedding
those as JS strings means escaping every backtick/`${` by hand — brittle and
ugly. Real files stay lintable and easy to evolve, and the generator stays tiny.

## Package layout (additions in **bold**)

```
extensions-migration/                 ← the @cnr-mtsn/shopify package root
  migrate-extensions.js               (existing)
  init-shopify.js                     ← NEW  bin: shopify-init
  create-node-app.js                  ← NEW  bin: shopify-create-node-app
  templates/node-app/                 ← NEW  skeleton copied by the scaffolder
    src/index.js
    src/config/shopify.js
    src/middleware/auth.js
    src/middleware/verifyShopifyWebhook.js
    src/routes/health.js
    src/routes/webhooks.js            (minimal: raw-body + HMAC verify + ack)
    src/services/.gitkeep
    src/utils/logger.js
    src/utils/shopify.js
    scripts/.gitkeep
    gitignore        → written as .gitignore
    env.example      → written as .env.example
    env              → written as .env (placeholder values)
    package.json     → ESM app manifest, {{APP_NAME}} token
    README.md
  package.json                        ← add 2 bin entries + keywords + version bump
  README.md                           ← add a section per new command
```

## Tool A — `shopify-init` (`init-shopify.js`)

Zero-dep Node port of the existing Bash script. Behavior identical, no `jq`,
runs on macOS/Linux/Windows. Algorithm:

1. **Theme guard.** Verify cwd contains all 7 theme dirs: `assets`, `config`,
   `layout`, `locales`, `sections`, `snippets`, `templates`. If not, print the
   red error ("Not a Shopify theme folder") and `process.exit(1)`.
2. **Prompt for store** via built-in `readline`. If the answer doesn't end in
   `.myshopify.com`, append it.
3. **Clean** pre-existing npm artifacts: remove `node_modules`, `package.json`,
   `package-lock.json` (use `fs.rmSync(..., { recursive: true, force: true })`).
4. **Write `package.json`** directly (replaces `npm init -y` + `jq`): build the
   object in JS and `JSON.stringify`. Must include
   `scripts.dev = "shopify theme dev --store=<store> --host=localhost --port=3000"`.
5. **Write `.gitignore`** = `package.json\npackage-lock.json\nnode_modules\n.claude\n.shopifyignore\n`.
6. **Write `.shopifyignore`** = `package.json\n.claude\n.gitignore\n`.
7. **Offer to start dev server**: prompt y/n; if y,
   `child_process.execSync('npm run dev', { stdio: 'inherit' })`.

Preserve the original's ANSI colors and box-drawing header/footer for parity.

**Note:** writing `package.json` directly (vs shelling to `npm init -y`) is
deliberate — deterministic output, no dependence on npm's interactive scaffolding.

## Tool B — `shopify-create-node-app` (`create-node-app.js`)

Scaffolds into the **current directory**. Algorithm:

1. **Resolve app name.** Default = `path.basename(process.cwd())`; prompt allows
   override. Used as the generated `package.json` `name` (sanitized to a valid
   npm name — lowercased, spaces→`-`).
2. **Collision check.** Compute the full list of target paths from the template
   tree. If any already exist in cwd, print the list and **abort** (exit 1) — no
   silent overwrite.
3. **Copy `templates/node-app/` → cwd**, recursively (built-in `fs.cpSync` or a
   manual walk). During copy:
   - Rename dotfiles: `gitignore`→`.gitignore`, `env`→`.env`, `env.example`→`.env.example`.
   - Substitute `{{APP_NAME}}` token (only in `package.json` and `README.md`).
   - `.gitkeep` files preserve empty `services/` and `scripts/` dirs.
4. **Print next steps** (do NOT run them): `npm install`, fill in `.env`,
   `npm run dev`, then the app serves `GET /health`.

### Generated app — files and deliberate cleanups vs `tyr`

Source of truth for content is `blueswitch/node-apps/tyr/src/*`, with these
explicit changes (these are NOT blind copies):

- **`src/config/shopify.js`** — port `tyr`'s client (Client Credentials Grant:
  `getAccessToken`, `createGraphQLClient`, `isValidShopDomain`, token cache) BUT
  **fix the `SHOPIFY_ACCESS_SCOPES` crash**: tyr's `shopify.js:23` does
  `process.env.SHOPIFY_ACCESS_SCOPES.split(',')` with no guard and the var is
  absent from its required-vars check and `.env.example`. Template makes scopes
  optional: `(process.env.SHOPIFY_ACCESS_SCOPES || '').split(',').map(s => s.trim()).filter(Boolean)`.
  Required vars stay `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`.
- **`src/index.js`** — port tyr's wiring but:
  - Replace tyr's hardcoded CORS allowlist with a generic, commented one:
    no-origin (server-to-server) + `/\.myshopify\.com$/` + `/\.trycloudflare\.com$/`,
    with a `// TODO: add your storefront/app domain` marker.
  - Mount only `/health` and `/webhooks` (drop tyr's customers/metafields/
    companies/files routes).
  - **Keep** the critical ordering: `app.use('/webhooks', webhookRoutes)` BEFORE
    `express.json()`, with the explanatory comment intact, so HMAC verification
    runs over the raw body.
  - Keep the `pino-http` request logger, 404 handler, and error handler.
  - Slim the `/` banner to a small `{ message, version }` (drop tyr's huge
    self-doc JSON).
- **`src/routes/webhooks.js`** — minimal: `express.raw({ type: 'application/json', limit: '5mb' })`
  → `verifyShopifyWebhook` → one placeholder handler (e.g. `POST /products/update`)
  that **ack's immediately** (`res.status(200).end()`) then logs `req.payload`.
  Demonstrates the pattern without tyr's business logic.
- **`src/middleware/verifyShopifyWebhook.js`** — copy verbatim (generic, correct).
- **`src/middleware/auth.js`** — copy verbatim (Bearer + `x-shopify-shop`).
- **`src/routes/health.js`** — copy near-verbatim (already generic).
- **`src/utils/logger.js`** — copy verbatim (pino + pino-pretty in dev).
- **`src/utils/shopify.js`** — copy verbatim (`toGid`).
- **`src/services/.gitkeep`** — empty, ready for services.
- **`scripts/.gitkeep`** — folder for one-off terminal scripts (not core app).

### Generated app — config files

- **`package.json`** (`{{APP_NAME}}`): `"type": "module"`, scripts
  `start: node src/index.js` and `dev: nodemon src/index.js`; deps
  `@shopify/shopify-api`, `cors`, `dotenv`, `express`, `pino`, `pino-http`;
  devDeps `nodemon`, `pino-pretty`. (Drop `concurrently` — no `shopify app dev`
  combo by default.)
- **`env.example` → `.env.example`** — from tyr's plus documented optionals:
  `NODE_ENV`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_SHOP`,
  `PORT`, `API_ACCESS_TOKEN`, `SHOPIFY_ACCESS_SCOPES` (optional), `LOG_LEVEL` (optional).
- **`env` → `.env`** — same keys with placeholder values (gitignored in the app).
- **`gitignore` → `.gitignore`** — `node_modules/`, `.env`, `*.log`, `logs/`,
  `.DS_Store`. **Commit the lockfile** by default (drop tyr's quirk of ignoring
  `package-lock.json`).
- **`README.md`** (`{{APP_NAME}}`) — short: what it is, env setup, `npm install`,
  `npm run dev`, the `/health` and `/webhooks` endpoints.

## Package manifest change (`extensions-migration/package.json`)

```json
"version": "2.1.0",
"bin": {
  "shopify-migrate": "migrate-extensions.js",
  "shopify-init": "init-shopify.js",
  "shopify-create-node-app": "create-node-app.js"
},
"keywords": [ ...existing, "scaffold", "express", "theme", "node" ]
```

Minor bump (additive). No `files` field (avoid accidentally excluding existing
bins); `templates/` publishes via default behavior. Ensure the two new `.js`
bins are executable (`chmod +x`) — matches the existing `migrate-extensions.js`.

## README (package)

Add a short section per command under Usage: `shopify-init` (theme dev setup) and
`shopify-create-node-app` (Express app scaffold), each with a one-line example.

## Edge cases

- `shopify-init` run outside a theme → guarded by the 7-dir check (exit 1).
- `shopify-create-node-app` in a non-empty dir with conflicting files → abort
  with the conflict list (exit 1); non-conflicting existing files are left alone.
- App-name sanitization for `package.json` `name` (npm naming rules).
- Template dotfiles never shipped as real dotfiles (npm rename gotcha) — enforced
  by storing un-dotted + renaming on write.

## Verification plan (before declaring done)

Type-checks/compiles ≠ works. Run, observe behavior:

1. `node init-shopify.js` in a throwaway dir containing the 7 fake theme dirs →
   confirm `package.json` dev script, `.gitignore`, `.shopifyignore` written;
   and the non-theme dir case exits 1.
2. `node create-node-app.js` in a throwaway empty dir → confirm full tree written
   with dotfiles correctly named; re-run → confirm collision abort.
3. In the scaffolded app: `npm install`, `npm run dev`, `curl localhost:3000/health`
   → expect `status: healthy/degraded` JSON; confirm server boots without the
   `SHOPIFY_ACCESS_SCOPES` crash when that var is unset.
4. (Optional) `npm pack --dry-run` in the package → confirm `templates/` and both
   new bins are included and template dotfiles are present un-dotted.

## Out of scope

- No unified `shopify <subcommand>` dispatcher — three sibling bins is enough.
- No TypeScript variant of the scaffold.
- No database/ORM, auth provider, or deploy config in the generated app.
- No changes to the existing `migrate-extensions.js` behavior.

## Suggested commit subject (user drives the commit)

`feat: add shopify-init and shopify-create-node-app CLI tools`
