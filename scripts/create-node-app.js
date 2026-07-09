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
