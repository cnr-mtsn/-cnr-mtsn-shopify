#!/usr/bin/env node
// graphql.js — interactive wrapper around `shopify store auth` / `store execute` /
// `store graphiql`. Prompts for a store and scopes, authenticates (browser flow),
// then runs ./query.graphql or ./mutation.graphql from the current directory, or
// opens GraphiQL. Zero-dependency; requires the Shopify CLI on PATH.

"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawnSync } = require("child_process");

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

// One shared interface plus a line queue — readline drops lines that arrive
// while no question is pending, which loses pre-buffered answers when stdin is
// piped. Queueing lines keeps the tool scriptable (e.g. printf "..." | shopify-graphql).
// Closed before any CLI command runs so the child process gets stdin to itself.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const bufferedLines = [];
const waitingResolvers = [];
rl.on("line", (line) => {
  const resolve = waitingResolvers.shift();
  if (resolve) resolve(line);
  else bufferedLines.push(line);
});
rl.on("close", () => {
  // EOF mid-prompt: resolve as empty so validation reports the real problem.
  while (waitingResolvers.length) waitingResolvers.shift()("");
});

function prompt(question) {
  process.stdout.write(question);
  if (bufferedLines.length) return Promise.resolve(bufferedLines.shift());
  return new Promise((resolve) => waitingResolvers.push(resolve));
}

/** Reduce "acme-parts", "acme-parts.myshopify.com", or a full admin URL to the bare store name. */
function normalizeStoreName(input) {
  return String(input || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\.myshopify\.com.*$/, "")
    .replace(/\/.*$/, "");
}

/** Run a Shopify CLI command with output streamed to the terminal. */
function runShopify(args) {
  const result = spawnSync("shopify", args, { stdio: "inherit" });
  if (result.error && result.error.code === "ENOENT") {
    console.error(`${RED}Shopify CLI not found on PATH. Install it: npm i -g @shopify/cli${RESET}`);
    process.exit(1);
  }
  return result.status ?? 1;
}

const ACTIONS = {
  1: { label: "Run ./query.graphql", file: "query.graphql" },
  2: { label: "Run ./mutation.graphql", file: "mutation.graphql", mutations: true },
  3: { label: "Open GraphiQL", graphiql: true },
};

async function main() {
  console.log(`\n${BOLD}Shopify Admin GraphQL${RESET} ${DIM}(store auth + execute wrapper)${RESET}\n`);

  const storeInput = await prompt(`  Store ${DIM}(name, without .myshopify.com)${RESET}: `);
  const storeName = normalizeStoreName(storeInput);
  if (!storeName) {
    console.error(`${RED}A store name is required.${RESET}`);
    process.exit(1);
  }
  const shop = `${storeName}.myshopify.com`;

  const scopes = (
    await prompt(`  Scopes ${DIM}(comma-separated; leave empty to reuse existing auth)${RESET}: `)
  ).trim().replace(/\s+/g, "");

  console.log(`\n  1) ${ACTIONS[1].label}\n  2) ${ACTIONS[2].label}\n  3) ${ACTIONS[3].label}\n`);
  const choice = (await prompt(`  Action ${DIM}(1/2/3)${RESET}: `)).trim();
  rl.close();
  const action = ACTIONS[choice];
  if (!action) {
    console.error(`${RED}Invalid choice "${choice}" — expected 1, 2, or 3.${RESET}`);
    process.exit(1);
  }

  // Validate the GraphQL file before kicking off a browser auth round-trip.
  if (action.file && !fs.existsSync(path.join(process.cwd(), action.file))) {
    console.error(`${RED}No ${action.file} found in ${process.cwd()}${RESET}`);
    process.exit(1);
  }

  if (scopes) {
    console.log(`\n${DIM}Authenticating against ${shop}...${RESET}`);
    const authStatus = runShopify(["store", "auth", "--store", shop, "--scopes", scopes]);
    if (authStatus !== 0) process.exit(authStatus);
    console.log(`${GREEN}Authenticated.${RESET}`);
  }

  let status;
  if (action.graphiql) {
    console.log(`\n${DIM}Opening GraphiQL for ${shop}...${RESET}`);
    status = runShopify(["store", "graphiql", "--store", shop, "--allow-mutations"]);
  } else {
    console.log(`\n${DIM}Running ${action.file} against ${shop}...${RESET}`);
    const args = ["store", "execute", "--store", shop, "--query-file", action.file, "--json"];
    if (action.mutations) args.push("--allow-mutations");
    status = runShopify(args);
  }
  process.exit(status);
}

main().catch((err) => {
  console.error(`${RED}${err.message}${RESET}`);
  process.exit(1);
});
