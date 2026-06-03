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
