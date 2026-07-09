# shopify-tools Ink TUI Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four readline bins in `@cnr-mtsn/shopify` with a single Ink-powered `shopify-tools` bin (launcher menu + subcommands) and delete all extension-migration tooling.

**Architecture:** Pure logic lives in `src/lib/*.js` (ESM, tested by `node --test`); Ink screens in `src/*.jsx` collect input and resolve *handoff descriptors*; the entry `src/cli.jsx` renders the app, waits for Ink to exit, then spawns handoff children with `stdio: "inherit"`. esbuild bundles `src/cli.jsx` → `dist/cli.js` (deps external).

**Tech Stack:** Node ≥22 (ink 7 floor; dev machine: v22), Ink, React, ink-text-input, ink-select-input, esbuild, `node --test`.

**Spec:** `docs/superpowers/specs/2026-07-09-ink-tui-launcher-design.md`

## Global Constraints

- Package root is `/Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/scripts`. All paths below are relative to it. The git repo root is the parent directory (`cnr-mtsn-shopify`), so git paths are prefixed `scripts/`.
- **NEVER run `git commit`** (user's CLAUDE.md). Each task ends with a PAUSE step: report status and suggest a single-line commit subject; the user commits.
- Version: `3.0.0`. Bin name: `shopify-tools` (exactly). Package converts to `"type": "module"`.
- Behavior of ported logic must be preserved verbatim — existing test assertions must pass unchanged (only import syntax changes).
- Runtime deps: `ink`, `react`, `ink-text-input`, `ink-select-input`. Dev dep: `esbuild`. No others. Install latest via npm (no pinned versions in this plan); resolve peer-dependency warnings by matching whatever react major the installed ink requires.
- `templates/node-app/` is untouched.
- Dropped feature (intentional, do not re-add): piped-stdin scriptability of the old `graphql.js`.

---

### Task 1: Delete all migration tooling

**Files:**
- Delete: `migrate-extensions.js`, `upgrade-functions.js`, `upgrade-ui-extensions.js`
- Delete: `old-api-version/` (directory), `latest-api-version/` (directory)
- Modify: `package.json` (remove dead bin/script entries only)
- Modify: `.gitignore`, `.npmignore` (remove references to deleted dirs)

**Interfaces:**
- Consumes: nothing.
- Produces: a package containing only the three surviving tools; `npm test` still green (tests target `init-shopify.js` / `create-node-app.js`, which remain until Task 2).

- [ ] **Step 1: Delete the files and directories**

```bash
cd /Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/scripts
rm migrate-extensions.js upgrade-functions.js upgrade-ui-extensions.js
rm -rf old-api-version latest-api-version
```

- [ ] **Step 2: Remove dead entries from package.json**

In `package.json`: delete the `"shopify-migrate": "migrate-extensions.js"` line from `bin`, and delete the `"migrate"` and `"migrate:dry-run"` entries from `scripts` (keep `"test"`). Also remove the now-inaccurate keywords `"extensions"`, `"migration"`, `"checkout"`, `"preact"`, `"polaris"`, `"functions"` from `keywords`.

- [ ] **Step 3: Clean ignore files**

In `.gitignore`, delete the `old-api-version` and `latest-api-version` lines. In `.npmignore`, delete both `old-api-version` and `latest-api-version` lines (they appear twice — once under the ".gitignore" comment block, once under dev-only artifacts; note some lines have trailing spaces).

- [ ] **Step 4: Verify tests still pass**

Run: `npm test`
Expected: all existing tests PASS (they exercise `init-shopify.js` and `create-node-app.js`, which still exist).

- [ ] **Step 5: PAUSE for user commit**

Report deletions. Suggested subject: `remove extension migration tooling`

---

### Task 2: ESM conversion — package.json v3, src/lib ports, test conversion

**Files:**
- Rewrite: `package.json`
- Create: `src/lib/init.js`, `src/lib/create-node-app.js`, `src/lib/graphql.js`
- Rewrite: `test/init-shopify.test.js`, `test/create-node-app.test.js`
- Create: `test/graphql.test.js`
- Delete: `init-shopify.js`, `create-node-app.js`, `graphql.js` (root scripts)
- Modify: `.gitignore` (add `node_modules`, `dist`)

**Interfaces:**
- Consumes: current root-script logic (ported verbatim).
- Produces (used by Tasks 3–4):
  - `src/lib/init.js`: `isThemeDir(cwd: string): boolean`, `normalizeStore(input: string): string`, `setupThemeDev({ cwd, storeName }): string` (returns resolved domain), `THEME_DIRS: string[]`
  - `src/lib/create-node-app.js`: `sanitizeAppName(input): string`, `destRelPath(relPath): string`, `listFiles(dir, base?): string[]`, `scaffoldNodeApp({ cwd, appName, templateDir? }): string[]` (throws `err` with `err.collisions: string[]` on existing files), `TEMPLATE_DIR: string`
  - `src/lib/graphql.js`: `normalizeStoreName(input): string`, `ACTIONS: Array<{label, value, file?, mutations?, graphiql?}>`, `buildHandoff({ shop, scopes, action }): Array<{cmd, args, note}>`

- [ ] **Step 1: Rewrite package.json**

Replace the whole file with:

```json
{
  "name": "@cnr-mtsn/shopify",
  "version": "3.0.0",
  "description": "Shopify developer CLI suite — interactive Ink launcher for theme dev setup, Node/Express app scaffolding, and Admin GraphQL queries",
  "type": "module",
  "bin": {
    "shopify-tools": "dist/cli.js"
  },
  "files": [
    "dist",
    "templates"
  ],
  "scripts": {
    "build": "esbuild src/cli.jsx --bundle --format=esm --platform=node --jsx=automatic --packages=external --banner:js='#!/usr/bin/env node' --outfile=dist/cli.js",
    "prepublishOnly": "npm run build",
    "test": "node --test test/*.test.js"
  },
  "keywords": [
    "shopify",
    "graphql",
    "admin-api",
    "scaffold",
    "express",
    "theme",
    "node",
    "cli",
    "ink"
  ],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/cnr-mtsn/-cnr-mtsn-shopify.git"
  },
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install ink react ink-text-input ink-select-input
npm install --save-dev esbuild
```

Expected: clean install. If npm reports a react peer-version conflict, install the react major that the resolved ink requires (check with `npm info ink peerDependencies`). If the installed ink requires a Node floor above 18, raise `engines.node` in package.json to match and note it at the PAUSE step.

- [ ] **Step 3: Add node_modules and dist to .gitignore**

Append to `.gitignore`:

```
node_modules
dist
```

- [ ] **Step 4: Create src/lib/init.js** (verbatim port of `init-shopify.js` logic — no UI)

```js
// src/lib/init.js — pure theme-dev-setup logic (no UI).
import fs from "node:fs";
import path from "node:path";

export const THEME_DIRS = ["assets", "config", "layout", "locales", "sections", "snippets", "templates"];

/** True only when `cwd` contains all 7 Shopify theme directories. */
export function isThemeDir(cwd) {
  return THEME_DIRS.every((dir) => {
    try {
      return fs.statSync(path.join(cwd, dir)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Append `.myshopify.com` if the store wasn't given as a full domain. */
export function normalizeStore(input) {
  const store = String(input).trim();
  return store.endsWith(".myshopify.com") ? store : `${store}.myshopify.com`;
}

/**
 * Write the theme dev files into `cwd`. Pure filesystem work — no prompts.
 * @returns {string} the resolved store domain
 */
export function setupThemeDev({ cwd, storeName }) {
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
```

- [ ] **Step 5: Create src/lib/create-node-app.js** (verbatim port; `__dirname` replaced by a package-root walk so the default `TEMPLATE_DIR` resolves correctly both from `src/lib/` in tests and from the `dist/` bundle)

```js
// src/lib/create-node-app.js — pure scaffolding logic (no UI). Dotfiles are
// stored un-dotted in the template (npm renames a literal .gitignore to
// .npmignore on publish) and are renamed back when written into the target app.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Walk upward until a directory containing package.json is found. */
function findPackageRoot(fromDir) {
  let dir = fromDir;
  while (!fs.existsSync(path.join(dir, "package.json"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Could not locate package root");
    dir = parent;
  }
  return dir;
}

export const TEMPLATE_DIR = path.join(
  findPackageRoot(path.dirname(fileURLToPath(import.meta.url))),
  "templates",
  "node-app"
);

// Template basenames that must be renamed when written into the target app.
const DOTFILE_RENAMES = {
  gitignore: ".gitignore",
  env: ".env",
  "env.example": ".env.example",
};

/** Reduce arbitrary input to a valid-ish npm package name; fallback if empty. */
export function sanitizeAppName(input) {
  const name = String(input || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_.]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return name || "shopify-app";
}

/** Recursively list files under `dir`, as paths relative to `base`. */
export function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

/** Map a template-relative path to its destination, applying dotfile renames to the basename. */
export function destRelPath(relPath) {
  const dir = path.dirname(relPath);
  const baseName = path.basename(relPath);
  const renamed = DOTFILE_RENAMES[baseName] || baseName;
  return dir === "." ? renamed : path.join(dir, renamed);
}

/**
 * Scaffold the app into `cwd`. Throws (err.collisions set) if any destination
 * file already exists — never overwrites. Returns the destination-relative paths written.
 */
export function scaffoldNodeApp({ cwd, appName, templateDir = TEMPLATE_DIR }) {
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
```

- [ ] **Step 6: Write the failing test for the graphql lib**

Create `test/graphql.test.js`:

```js
import test from "node:test";
import assert from "node:assert";
import { normalizeStoreName, ACTIONS, buildHandoff } from "../src/lib/graphql.js";

test("normalizeStoreName reduces any input form to the bare store name", () => {
  assert.strictEqual(normalizeStoreName("acme-parts"), "acme-parts");
  assert.strictEqual(normalizeStoreName("acme-parts.myshopify.com"), "acme-parts");
  assert.strictEqual(normalizeStoreName("https://acme-parts.myshopify.com/admin"), "acme-parts");
  assert.strictEqual(normalizeStoreName("  acme/anything "), "acme");
  assert.strictEqual(normalizeStoreName(""), "");
  assert.strictEqual(normalizeStoreName(undefined), "");
});

test("ACTIONS defines query, mutation, and graphiql entries", () => {
  assert.deepStrictEqual(ACTIONS.map((a) => a.value), ["query", "mutation", "graphiql"]);
  assert.strictEqual(ACTIONS[0].file, "query.graphql");
  assert.strictEqual(ACTIONS[1].file, "mutation.graphql");
  assert.strictEqual(ACTIONS[1].mutations, true);
  assert.strictEqual(ACTIONS[2].graphiql, true);
});

test("buildHandoff without scopes runs execute only", () => {
  const steps = buildHandoff({ shop: "acme.myshopify.com", scopes: "", action: ACTIONS[0] });
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].cmd, "shopify");
  assert.deepStrictEqual(steps[0].args, [
    "store", "execute", "--store", "acme.myshopify.com", "--query-file", "query.graphql", "--json",
  ]);
});

test("buildHandoff with scopes prepends an auth step", () => {
  const steps = buildHandoff({ shop: "acme.myshopify.com", scopes: "read_products", action: ACTIONS[0] });
  assert.strictEqual(steps.length, 2);
  assert.deepStrictEqual(steps[0].args, [
    "store", "auth", "--store", "acme.myshopify.com", "--scopes", "read_products",
  ]);
});

test("buildHandoff adds --allow-mutations for mutations", () => {
  const steps = buildHandoff({ shop: "acme.myshopify.com", scopes: "", action: ACTIONS[1] });
  assert.ok(steps[0].args.includes("--allow-mutations"));
  assert.ok(steps[0].args.includes("mutation.graphql"));
});

test("buildHandoff graphiql action opens graphiql with mutations allowed", () => {
  const steps = buildHandoff({ shop: "acme.myshopify.com", scopes: "", action: ACTIONS[2] });
  assert.deepStrictEqual(steps[0].args, [
    "store", "graphiql", "--store", "acme.myshopify.com", "--allow-mutations",
  ]);
});
```

- [ ] **Step 7: Run the graphql test to verify it fails**

Run: `node --test test/graphql.test.js`
Expected: FAIL — `Cannot find module '../src/lib/graphql.js'`

- [ ] **Step 8: Create src/lib/graphql.js**

```js
// src/lib/graphql.js — pure logic for the Admin GraphQL tool (no UI, no spawning).
// Builds handoff descriptors consumed by src/lib/run.js after Ink exits.

/** Reduce "acme-parts", "acme-parts.myshopify.com", or a full admin URL to the bare store name. */
export function normalizeStoreName(input) {
  return String(input || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\.myshopify\.com.*$/, "")
    .replace(/\/.*$/, "");
}

export const ACTIONS = [
  { label: "Run ./query.graphql", value: "query", file: "query.graphql" },
  { label: "Run ./mutation.graphql", value: "mutation", file: "mutation.graphql", mutations: true },
  { label: "Open GraphiQL", value: "graphiql", graphiql: true },
];

/**
 * Build the ordered shopify-CLI handoff steps: optional auth (only when scopes
 * were given), then execute or graphiql.
 */
export function buildHandoff({ shop, scopes, action }) {
  const steps = [];
  if (scopes) {
    steps.push({
      cmd: "shopify",
      args: ["store", "auth", "--store", shop, "--scopes", scopes],
      note: `Authenticating against ${shop}...`,
    });
  }
  if (action.graphiql) {
    steps.push({
      cmd: "shopify",
      args: ["store", "graphiql", "--store", shop, "--allow-mutations"],
      note: `Opening GraphiQL for ${shop}...`,
    });
  } else {
    const args = ["store", "execute", "--store", shop, "--query-file", action.file, "--json"];
    if (action.mutations) args.push("--allow-mutations");
    steps.push({ cmd: "shopify", args, note: `Running ${action.file} against ${shop}...` });
  }
  return steps;
}
```

- [ ] **Step 9: Convert the two existing test files to ESM**

Rewrite `test/init-shopify.test.js` — only the import block changes; every test body stays byte-identical to the current file:

```js
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isThemeDir, normalizeStore, setupThemeDev } from "../src/lib/init.js";
```

(Keep everything from `const THEME_DIRS = [...]` down unchanged.)

Rewrite `test/create-node-app.test.js` imports the same way:

```js
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sanitizeAppName, destRelPath, scaffoldNodeApp } from "../src/lib/create-node-app.js";
```

(All test bodies unchanged.)

- [ ] **Step 10: Delete the old root scripts**

```bash
rm init-shopify.js create-node-app.js graphql.js
```

- [ ] **Step 11: Run the full suite**

Run: `npm test`
Expected: ALL tests PASS (init: 5, create-node-app: 5, graphql: 6). The
create-node-app template test proves `TEMPLATE_DIR` resolves correctly from `src/lib/`.

- [ ] **Step 12: PAUSE for user commit**

Suggested subject: `convert to ESM, move tool logic to src/lib, add ink deps`

---

### Task 3: Ink UI — entry, launcher, three tool screens, build

**Files:**
- Create: `src/lib/run.js`, `src/cli.jsx`, `src/app.jsx`, `src/launcher.jsx`
- Create: `src/tools/init.jsx`, `src/tools/create-node-app.jsx`, `src/tools/graphql.jsx`

**Interfaces:**
- Consumes: everything in the Task 2 "Produces" block.
- Produces: `dist/cli.js` (built bin). Internal contracts:
  - Every tool screen receives `onFinish(result)` where `result = { handoff?: Array<{cmd, args, note?, cwd?}>, exitCode?: number }` (both optional; defaults: no handoff, exit 0).
  - `src/lib/run.js`: `runHandoff(steps): number` — runs each step with inherited stdio, returns first non-zero status (or 1 on ENOENT with a friendly message), else 0.

- [ ] **Step 1: Create src/lib/run.js**

```js
// src/lib/run.js — runs handoff descriptors after the Ink app has exited and
// released the terminal. stdio is inherited so children (npm run dev, shopify
// store auth/execute/graphiql) own the terminal.
import { spawnSync } from "node:child_process";

const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

/** @returns {number} exit code — 0 on success, first failing status otherwise */
export function runHandoff(steps) {
  for (const step of steps) {
    if (step.note) console.log(`\n${DIM}${step.note}${RESET}`);
    const result = spawnSync(step.cmd, step.args, { stdio: "inherit", cwd: step.cwd });
    if (result.error && result.error.code === "ENOENT") {
      const msg =
        step.cmd === "shopify"
          ? "Shopify CLI not found on PATH. Install it: npm i -g @shopify/cli"
          : `${step.cmd} not found on PATH.`;
      console.error(`${RED}${msg}${RESET}`);
      return 1;
    }
    const status = result.status ?? 1;
    if (status !== 0) return status;
  }
  return 0;
}
```

- [ ] **Step 2: Create src/launcher.jsx** (hand-rolled list — ink-select-input's item component only receives `label`, and the launcher needs a two-column title + description row)

```jsx
// src/launcher.jsx — full-screen tool picker shown when shopify-tools runs bare.
import { useState } from "react";
import { Box, Text, useInput } from "ink";

export const TOOLS = [
  { value: "init", title: "init", desc: "Theme dev setup" },
  { value: "create-node-app", title: "create-node-app", desc: "Node/Express app scaffold" },
  { value: "graphql", title: "graphql", desc: "Admin GraphQL runner" },
];

export function Launcher({ onSelect, onQuit }) {
  const [index, setIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) setIndex((i) => (i + TOOLS.length - 1) % TOOLS.length);
    else if (key.downArrow) setIndex((i) => (i + 1) % TOOLS.length);
    else if (key.return) onSelect(TOOLS[index].value);
    else if (input === "q" || key.escape) onQuit();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} width={52}>
      <Text bold color="cyan">@cnr-mtsn/shopify</Text>
      <Box height={1} />
      {TOOLS.map((tool, i) => {
        const selected = i === index;
        return (
          <Box key={tool.value}>
            <Text color="green">{selected ? "❯ " : "  "}</Text>
            <Box width={18}>
              <Text bold={selected} color={selected ? "green" : undefined}>{tool.title}</Text>
            </Box>
            <Text dimColor>{tool.desc}</Text>
          </Box>
        );
      })}
      <Box height={1} />
      <Text dimColor>↑/↓ navigate · ⏎ run · q quit</Text>
    </Box>
  );
}
```

- [ ] **Step 3: Create src/tools/init.jsx**

```jsx
// src/tools/init.jsx — theme dev setup screen. Guard → store input → checklist
// → optional handoff to `npm run dev`.
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { isThemeDir, setupThemeDev } from "../lib/init.js";

export function InitTool({ onFinish }) {
  const cwd = process.cwd();
  const [themeOk] = useState(() => isThemeDir(cwd));
  const [storeInput, setStoreInput] = useState("");
  const [store, setStore] = useState(null); // resolved domain once setup has run

  // Guard failure: paint the error frame, then exit 1 (effects run post-render).
  useEffect(() => {
    if (!themeOk) onFinish({ exitCode: 1 });
  }, [themeOk]);

  if (!themeOk) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red" bold>Error: Not a Shopify theme folder.</Text>
        <Text dimColor>Run this from the root of your Shopify theme.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Shopify Dev Setup</Text>
      <Text dimColor>─────────────────────────────────────</Text>
      {store === null ? (
        <Box>
          <Text>
            Store <Text dimColor>(name or full .myshopify.com URL)</Text>:{" "}
          </Text>
          <TextInput
            value={storeInput}
            onChange={setStoreInput}
            onSubmit={(value) => setStore(setupThemeDev({ cwd, storeName: value }))}
          />
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text><Text color="green">✓</Text> Initialized package.json</Text>
          <Text><Text color="green">✓</Text> Added dev script <Text dimColor>→ {store}</Text></Text>
          <Text><Text color="green">✓</Text> Created .gitignore</Text>
          <Text><Text color="green">✓</Text> Created .shopifyignore</Text>
          <Box height={1} />
          <Text><Text bold color="green">Ready!</Text> <Text dimColor>Start dev server now?</Text></Text>
          <SelectInput
            items={[
              { label: "Yes — npm run dev", value: "yes" },
              { label: "No — exit", value: "no" },
            ]}
            onSelect={(item) =>
              item.value === "yes"
                ? onFinish({ handoff: [{ cmd: "npm", args: ["run", "dev"], cwd, note: "Starting dev server..." }] })
                : onFinish({})
            }
          />
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 4: Create src/tools/create-node-app.jsx**

```jsx
// src/tools/create-node-app.jsx — scaffold screen. Name input → scaffold →
// success panel with next steps (or collision error). No handoff.
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import path from "node:path";
import { sanitizeAppName, scaffoldNodeApp } from "../lib/create-node-app.js";

export function CreateNodeAppTool({ onFinish }) {
  const cwd = process.cwd();
  const defaultName = sanitizeAppName(path.basename(cwd));
  const [nameInput, setNameInput] = useState("");
  const [result, setResult] = useState(null); // { written: string[] } | { error: string }

  // Exit after the result frame paints.
  useEffect(() => {
    if (result) onFinish({ exitCode: result.error ? 1 : 0 });
  }, [result]);

  const handleSubmit = (value) => {
    const appName = value.trim() ? sanitizeAppName(value) : defaultName;
    try {
      setResult({ written: scaffoldNodeApp({ cwd, appName }) });
    } catch (err) {
      setResult({ error: err.message });
    }
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Create Shopify Node App</Text>
      <Text dimColor>─────────────────────────────────────</Text>
      {result === null ? (
        <Box>
          <Text>App name: </Text>
          <TextInput
            value={nameInput}
            onChange={setNameInput}
            onSubmit={handleSubmit}
            placeholder={defaultName}
          />
        </Box>
      ) : result.error ? (
        <Text color="red" bold>Error: {result.error}</Text>
      ) : (
        <Box flexDirection="column">
          <Text>
            <Text color="green">✓</Text> Scaffolded {result.written.length} files into <Text dimColor>{cwd}</Text>
          </Text>
          <Box height={1} />
          <Text bold>Next steps:</Text>
          <Text>  <Text dimColor>1.</Text> npm install</Text>
          <Text>  <Text dimColor>2.</Text> Edit .env with your Shopify credentials</Text>
          <Text>  <Text dimColor>3.</Text> npm run dev <Text dimColor>→ GET /health</Text></Text>
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 5: Create src/tools/graphql.jsx**

```jsx
// src/tools/graphql.jsx — Admin GraphQL screen. Store → scopes → action →
// validate file → handoff to shopify store auth/execute/graphiql.
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import fs from "node:fs";
import path from "node:path";
import { normalizeStoreName, ACTIONS, buildHandoff } from "../lib/graphql.js";

export function GraphqlTool({ onFinish }) {
  const [step, setStep] = useState("store"); // store | scopes | action
  const [storeInput, setStoreInput] = useState("");
  const [scopesInput, setScopesInput] = useState("");
  const [storeName, setStoreName] = useState("");
  const [scopes, setScopes] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (error) onFinish({ exitCode: 1 });
  }, [error]);

  const submitStore = (value) => {
    const name = normalizeStoreName(value);
    if (!name) {
      setError("A store name is required.");
      return;
    }
    setStoreName(name);
    setStep("scopes");
  };

  const submitScopes = (value) => {
    setScopes(value.trim().replace(/\s+/g, ""));
    setStep("action");
  };

  const submitAction = (item) => {
    const action = ACTIONS.find((a) => a.value === item.value);
    if (action.file && !fs.existsSync(path.join(process.cwd(), action.file))) {
      setError(`No ${action.file} found in ${process.cwd()}`);
      return;
    }
    onFinish({ handoff: buildHandoff({ shop: `${storeName}.myshopify.com`, scopes, action }) });
  };

  if (error) {
    return (
      <Box paddingX={1}>
        <Text color="red" bold>Error: {error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>
        <Text bold>Shopify Admin GraphQL</Text> <Text dimColor>(store auth + execute wrapper)</Text>
      </Text>
      <Text dimColor>─────────────────────────────────────</Text>

      {storeName ? (
        <Text dimColor>Store: {storeName}</Text>
      ) : (
        <Box>
          <Text>
            Store <Text dimColor>(name, without .myshopify.com)</Text>:{" "}
          </Text>
          <TextInput value={storeInput} onChange={setStoreInput} onSubmit={submitStore} />
        </Box>
      )}

      {step === "scopes" && (
        <Box>
          <Text>
            Scopes <Text dimColor>(comma-separated; empty reuses existing auth)</Text>:{" "}
          </Text>
          <TextInput value={scopesInput} onChange={setScopesInput} onSubmit={submitScopes} />
        </Box>
      )}

      {step === "action" && (
        <Box flexDirection="column">
          <Text dimColor>Scopes: {scopes || "(reuse existing auth)"}</Text>
          <Box height={1} />
          <SelectInput
            items={ACTIONS.map(({ label, value }) => ({ label, value }))}
            onSelect={submitAction}
          />
        </Box>
      )}
    </Box>
  );
}
```

- [ ] **Step 6: Create src/app.jsx**

```jsx
// src/app.jsx — routes between the launcher and tool screens inside one Ink app.
import { useState } from "react";
import { useApp } from "ink";
import { Launcher } from "./launcher.jsx";
import { InitTool } from "./tools/init.jsx";
import { CreateNodeAppTool } from "./tools/create-node-app.jsx";
import { GraphqlTool } from "./tools/graphql.jsx";

const SCREENS = {
  init: InitTool,
  "create-node-app": CreateNodeAppTool,
  graphql: GraphqlTool,
};

export function App({ initialTool, onDone }) {
  const { exit } = useApp();
  const [tool, setTool] = useState(initialTool);

  // Tools call onFinish exactly once; record the result, then unmount Ink so
  // cli.jsx can run any handoff with the terminal released.
  const finish = (result = {}) => {
    onDone(result);
    exit();
  };

  if (!tool) return <Launcher onSelect={setTool} onQuit={() => finish({})} />;
  const Screen = SCREENS[tool];
  return <Screen onFinish={finish} />;
}
```

- [ ] **Step 7: Create src/cli.jsx**

```jsx
// src/cli.jsx — shopify-tools entry. Bare → launcher; subcommand → tool screen.
// Handoff children (npm run dev, shopify store ...) run AFTER Ink exits so
// they get the terminal to themselves.
import { render } from "ink";
import { App } from "./app.jsx";
import { runHandoff } from "./lib/run.js";

const COMMANDS = ["init", "create-node-app", "graphql"];
const arg = process.argv[2];

const USAGE = `Usage: shopify-tools [command]

Commands:
  init             Set up a Shopify theme for local development
  create-node-app  Scaffold a Shopify Node/Express app
  graphql          Run Admin GraphQL queries via the Shopify CLI

Run with no command to open the interactive launcher.`;

if (arg === "--help" || arg === "-h") {
  console.log(USAGE);
  process.exit(0);
}
if (arg && !COMMANDS.includes(arg)) {
  console.error(`Unknown command "${arg}"\n\n${USAGE}`);
  process.exit(1);
}

let outcome = {};
const { waitUntilExit } = render(<App initialTool={arg ?? null} onDone={(result) => { outcome = result; }} />);
await waitUntilExit();

let exitCode = outcome.exitCode ?? 0;
if (exitCode === 0 && outcome.handoff) exitCode = runHandoff(outcome.handoff);
process.exit(exitCode);
```

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: `dist/cli.js` written, no errors.

- [ ] **Step 9: Smoke-test help and unknown-command paths (no TTY needed)**

```bash
node dist/cli.js --help; echo "exit=$?"
node dist/cli.js bogus; echo "exit=$?"
```

Expected: usage text with exit=0; `Unknown command "bogus"` + usage with exit=1.

- [ ] **Step 10: Smoke-test the launcher under a pseudo-TTY**

macOS ships `expect`, which allocates a pty (the Bash tool itself is not a TTY, and Ink's `useInput` requires raw mode):

```bash
expect <<'EOF'
set timeout 10
spawn node dist/cli.js
expect "@cnr-mtsn/shopify" { }
expect "navigate"
send "q"
expect eof
EOF
```

Expected: the bordered menu renders (all three tools listed), `q` exits cleanly.

- [ ] **Step 11: Run the test suite**

Run: `npm test`
Expected: all 16 tests PASS.

- [ ] **Step 12: PAUSE for user commit**

Suggested subject: `add shopify-tools ink launcher and tool screens`

---

### Task 4: README rewrite and packaging

**Files:**
- Rewrite: `README.md`
- Delete: `.npmignore` (the `files` whitelist in package.json replaces it)

**Interfaces:**
- Consumes: the built package from Task 3.
- Produces: publishable package — `npm pack --dry-run` shows exactly `dist/cli.js`, `templates/node-app/**`, `package.json`, `README.md`.

- [ ] **Step 1: Delete .npmignore**

```bash
rm .npmignore
```

(With a `files` whitelist, npm ignores `.gitignore` for packing and includes only the listed paths plus package.json/README. The un-dotted `templates/node-app/gitignore` publishes correctly — that's why it's stored un-dotted.)

- [ ] **Step 2: Rewrite README.md**

Replace the entire file with:

````markdown
# @cnr-mtsn/shopify

Shopify developer CLI suite with an interactive [Ink](https://github.com/vadimdemedes/ink) launcher.
One bin, three tools: theme dev setup, Node/Express app scaffolding, and ad-hoc
Admin GraphQL queries.

## Install

```bash
npm i -g @cnr-mtsn/shopify
# or run without installing
npx @cnr-mtsn/shopify
```

Requires Node 22+. The `graphql` tool additionally requires the Shopify CLI
(`npm i -g @shopify/cli`).

## Usage

```bash
shopify-tools                  # open the interactive launcher
shopify-tools init             # jump straight to a tool
shopify-tools create-node-app
shopify-tools graphql
shopify-tools --help
```

Running bare opens a menu — ↑/↓ to navigate, ⏎ to run, q to quit:

```
╭──────────────────────────────────────────────────╮
│  @cnr-mtsn/shopify                               │
│                                                  │
│  ❯ init              Theme dev setup             │
│    create-node-app   Node/Express app scaffold   │
│    graphql           Admin GraphQL runner        │
│                                                  │
│  ↑/↓ navigate · ⏎ run · q quit                   │
╰──────────────────────────────────────────────────╯
```

## Tools

### init — theme dev setup

Run from the root of a Shopify theme (all 7 standard directories must exist).
Prompts for a store, then writes a `package.json` with a `dev` script
(`shopify theme dev --store=<store> --host=localhost --port=3000`), a
`.gitignore`, and a `.shopifyignore`, and offers to start the dev server.

```bash
cd my-theme
shopify-tools init
```

### create-node-app — Node/Express scaffold

Scaffolds a Shopify Node/Express app into the current directory — Admin
GraphQL client (Client Credentials Grant), pino logging, webhook HMAC
verification, Bearer auth, and a working `/health` route. Refuses to
overwrite existing files.

```bash
mkdir my-app && cd my-app
shopify-tools create-node-app
npm install
npm run dev   # GET /health
```

### graphql — Admin GraphQL runner

Run ad-hoc Admin GraphQL against any store you can log into, using the
Shopify CLI's user-scoped auth (`shopify store auth` / `store execute`) — no
app, client id, or access token needed. Prompts for the store and scopes
(leave scopes empty to reuse a cached auth), then runs `./query.graphql` or
`./mutation.graphql` from the current directory, or opens GraphiQL.

```bash
cd any-project        # with a query.graphql / mutation.graphql if running files
shopify-tools graphql
```

The browser auth screen opens on first use per store; the token is cached by
the Shopify CLI and acts as *you*, limited by your staff/collaborator
permissions.

## Development

```bash
npm install
npm test          # node --test over src/lib
npm run build     # esbuild → dist/cli.js
node dist/cli.js  # run the built CLI
```

Pure logic lives in `src/lib/` (tested); Ink screens live in `src/` and
`src/tools/`. `prepublishOnly` rebuilds `dist/` automatically.
````

- [ ] **Step 3: Verify pack contents**

Run: `npm pack --dry-run`
Expected: tarball lists `dist/cli.js`, everything under `templates/node-app/`, `package.json`, `README.md` — and nothing else (no `src/`, `test/`, `docs/`).

- [ ] **Step 4: PAUSE for user commit**

Suggested subject: `rewrite README for shopify-tools, replace npmignore with files whitelist`

---

### Task 5: End-to-end verification of all three flows

**Files:** none created — verification only (temp dirs under the session scratchpad).

**Interfaces:**
- Consumes: `dist/cli.js` from Task 3.
- Produces: evidence each flow works; the only remaining unverified path is a live `shopify store execute` run (needs real store auth — user does this).

Every step below re-declares `PKG=/Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/scripts` because shell state does not persist between separate command invocations.

- [ ] **Step 1: init flow in a fake theme dir (pseudo-TTY)**

```bash
PKG=/Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/scripts
DIR=$(mktemp -d) && cd "$DIR" && mkdir assets config layout locales sections snippets templates
expect <<EOF
set timeout 10
spawn node $PKG/dist/cli.js init
expect "Store"
send "acme\r"
expect "Ready!"
send "\x1b\[B"
send "\r"
expect eof
EOF
cat package.json .gitignore .shopifyignore
```

Expected: checklist of four ✓ lines rendered; after down-arrow + enter on
"No — exit" the app quits without starting a server; `package.json` contains
`"dev": "shopify theme dev --store=acme.myshopify.com --host=localhost --port=3000"`;
`.gitignore` and `.shopifyignore` match the lib fixtures.

- [ ] **Step 2: init guard in a non-theme dir**

```bash
PKG=/Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/scripts
cd $(mktemp -d) && node $PKG/dist/cli.js init; echo "exit=$?"
```

Expected: red "Error: Not a Shopify theme folder." and exit=1. (No input
needed, so this path may run without expect; if Ink raises a raw-mode error
instead, wrap in the same `expect ... expect eof` harness.)

- [ ] **Step 3: create-node-app flow in an empty dir**

```bash
PKG=/Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/scripts
DIR=$(mktemp -d) && cd "$DIR"
expect <<EOF
set timeout 10
spawn node $PKG/dist/cli.js create-node-app
expect "App name"
send "demo-app\r"
expect "Scaffolded"
expect eof
EOF
ls -a; grep '"name"' package.json
```

Expected: "Scaffolded N files" panel with next steps; `.gitignore`, `.env`,
`.env.example`, `src/`, `package.json` present; `"name": "demo-app"`.

- [ ] **Step 4: create-node-app collision path**

Re-run the same expect script in the SAME directory.
Expected: red "Error: Refusing to overwrite existing files: ..." and exit 1.

- [ ] **Step 5: graphql validation path (no .graphql file)**

```bash
PKG=/Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/scripts
cd $(mktemp -d)
expect <<EOF
set timeout 10
spawn node $PKG/dist/cli.js graphql
expect "Store"
send "acme\r"
expect "Scopes"
send "\r"
expect "query.graphql"
send "\r"
expect "No query.graphql found"
expect eof
EOF
```

Expected: store/scopes accepted, action menu shown, selecting "Run
./query.graphql" without the file present renders the red error and exits 1
(never reaches `shopify store auth`).

- [ ] **Step 6: launcher-to-tool navigation**

```bash
PKG=/Users/cnrmtsn/Development/blueswitch/tools/npm-packages/cnr-mtsn-shopify/scripts
cd $(mktemp -d)
expect <<EOF
set timeout 10
spawn node $PKG/dist/cli.js
expect "navigate"
send "\x1b\[B"
send "\r"
expect "Create Shopify Node App"
send "\x03"
expect eof
EOF
```

Expected: launcher renders, down-arrow + enter opens the create-node-app
screen (proves in-app screen swap), Ctrl-C exits.

- [ ] **Step 7: full test suite one last time**

Run: `cd $PKG && npm test`
Expected: all tests PASS.

- [ ] **Step 8: PAUSE — report results**

Summarize verification evidence. Remaining user actions: try `shopify-tools
graphql` against a real store (live auth + execute), and `npm publish` when
ready. Suggested subject if any fixes were needed: `fix TUI issues found in verification`
