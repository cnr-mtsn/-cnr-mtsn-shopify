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
