#!/usr/bin/env node
// upgrade-ui-extensions.js
//
// ⚠️  DEPRECATED: This script has been superseded by migrate-extensions.js
// Please use: node migrate-extensions.js [path] [--api-version 2026-01] [--dry-run]
// The new unified script handles both Functions and UI Extensions interactively.
//
// Migrates Shopify UI (checkout / customer-account) extensions to a target API version.
//
// Usage:
//   node upgrade-ui-extensions.js                          # scan ./extensions/, target 2026-01
//   node upgrade-ui-extensions.js --api-version 2025-10   # different target version
//   node upgrade-ui-extensions.js extensions/order-note   # single extension dir
//   node upgrade-ui-extensions.js --dry-run                # preview changes without writing

console.log("\n⚠️  DEPRECATED: Please use 'node migrate-extensions.js' instead.\n");

"use strict";

const fs   = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(msg)     { console.log(msg); }
function warn(msg)    { console.log(`  ⚠  ${msg}`); }
function info(msg)    { console.log(`  →  ${msg}`); }
function success(msg) { console.log(`  ✓  ${msg}`); }

function readFile(p)            { return fs.readFileSync(p, "utf8"); }
function writeFile(p, content)  { fs.writeFileSync(p, content, "utf8"); }

// Derive the npm package version range from an API version string.
// "2026-01" → "2026.01.x"
function apiVersionToPackageVersion(apiVersion) {
  const [year, month] = apiVersion.split("-");
  return `${year}.${month}.x`;
}

// ---------------------------------------------------------------------------
// TOML helpers (line-based rewriting, no full parser needed)
// ---------------------------------------------------------------------------
function extractApiVersion(tomlContent) {
  const m = tomlContent.match(/api_version\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function rewriteApiVersion(tomlContent, newVersion) {
  return tomlContent.replace(
    /(api_version\s*=\s*)"[^"]*"/,
    `$1"${newVersion}"`
  );
}

// ---------------------------------------------------------------------------
// package.json migration
// ---------------------------------------------------------------------------
function migratePackageJson(pkgPath, targetPkgVersion) {
  const raw = readFile(pkgPath);
  let pkg;
  try { pkg = JSON.parse(raw); } catch { return { changed: false, notes: [] }; }

  const changes = [];
  const notes   = [];

  // --- update @shopify/ui-extensions in deps ---
  if (pkg.dependencies && pkg.dependencies["@shopify/ui-extensions"]) {
    const old = pkg.dependencies["@shopify/ui-extensions"];
    if (old !== targetPkgVersion) {
      pkg.dependencies["@shopify/ui-extensions"] = targetPkgVersion;
      changes.push(`@shopify/ui-extensions  ${old} → ${targetPkgVersion}`);
    }
  }

  // --- update @shopify/ui-extensions-react in deps ---
  if (pkg.dependencies && pkg.dependencies["@shopify/ui-extensions-react"]) {
    const old = pkg.dependencies["@shopify/ui-extensions-react"];
    if (old !== targetPkgVersion) {
      pkg.dependencies["@shopify/ui-extensions-react"] = targetPkgVersion;
      changes.push(`@shopify/ui-extensions-react  ${old} → ${targetPkgVersion}`);
    }
  }

  // --- remove react-reconciler (no longer a peer dep requirement in modern SDK) ---
  ["dependencies", "devDependencies"].forEach(section => {
    if (pkg[section] && pkg[section]["react-reconciler"]) {
      delete pkg[section]["react-reconciler"];
      changes.push(`removed react-reconciler from ${section}`);
    }
  });

  if (changes.length === 0) return { changed: false, notes };

  // preserve trailing newline
  const trailing = raw.endsWith("\n") ? "\n" : "";
  return { changed: true, content: JSON.stringify(pkg, null, 2) + trailing, changes, notes };
}

// ---------------------------------------------------------------------------
// Core: process one UI extension directory
// ---------------------------------------------------------------------------
function migrateUIExtension(extDir, targetApiVersion, dryRun) {
  const tomlPath = path.join(extDir, "shopify.extension.toml");
  if (!fs.existsSync(tomlPath)) return false;

  const tomlContent  = readFile(tomlPath);
  const currentVersion = extractApiVersion(tomlContent);
  if (!currentVersion) {
    warn(`Could not parse api_version from ${tomlPath} — skipping`);
    return false;
  }

  // skip if already at or beyond target
  if (currentVersion === targetApiVersion) {
    log(`\n  ${path.basename(extDir)}  —  already at ${targetApiVersion}, skipping`);
    return false;
  }

  const targetPkgVersion = apiVersionToPackageVersion(targetApiVersion);
  log(`\n  Extension: ${path.basename(extDir)}`);
  log(`  api_version ${currentVersion}  →  ${targetApiVersion}  (packages → ${targetPkgVersion})\n`);

  const ops = []; // { desc, apply }

  // --- shopify.extension.toml ---
  {
    const newToml = rewriteApiVersion(tomlContent, targetApiVersion);
    ops.push({
      desc: `shopify.extension.toml — api_version bumped to ${targetApiVersion}`,
      apply: () => writeFile(tomlPath, newToml),
    });
  }

  // --- package.json ---
  const pkgPath = path.join(extDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    const { changed, content, changes } = migratePackageJson(pkgPath, targetPkgVersion);
    if (changed) {
      changes.forEach(c => {
        ops.push({ desc: `package.json — ${c}`, apply: () => {} }); // logged only; single write below
      });
      // single write op for the whole file
      const writeOnce = { _done: false };
      const applyPkg = () => { if (!writeOnce._done) { writeFile(pkgPath, content); writeOnce._done = true; } };
      // patch every pkg op's apply to use the single writer
      ops.forEach(op => {
        if (op.desc.startsWith("package.json")) op.apply = applyPkg;
      });
    }
  }

  // --- remove legacy files if present ---
  ["shopify.d.ts", "tsconfig.json"].forEach(file => {
    const fp = path.join(extDir, file);
    if (fs.existsSync(fp)) {
      ops.push({
        desc: `${file} — removed (deprecated)`,
        apply: () => fs.unlinkSync(fp),
      });
    }
  });

  // --- print & apply ---
  ops.forEach(op => info(op.desc));

  if (!dryRun) {
    ops.forEach(op => op.apply());
    success("Changes written.");
  } else {
    log("\n  (dry run — no files written)");
  }

  return true;
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------
function discoverUIExtensions(baseDir) {
  const results = [];
  if (!fs.existsSync(baseDir)) return results;
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const toml = path.join(baseDir, entry.name, "shopify.extension.toml");
    if (!fs.existsSync(toml)) continue;
    if (/type\s*=\s*"ui_extension"/.test(readFile(toml))) {
      results.push(path.join(baseDir, entry.name));
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  // --api-version <ver>
  let targetApiVersion = "2026-01";
  const avIdx = args.indexOf("--api-version");
  if (avIdx !== -1 && args[avIdx + 1]) {
    targetApiVersion = args[avIdx + 1];
  }

  const paths = args.filter(a => !a.startsWith("--") && a !== args[avIdx + 1]);

  log("╭─────────────────────────────────────────────────────────╮");
  log("│  Shopify UI Extensions Migration Tool                   │");
  log(`│  Target API version: ${targetApiVersion.padEnd(36)}│`);
  log("╰─────────────────────────────────────────────────────────╯");
  if (dryRun) log("\n  Mode: DRY RUN — no files will be written\n");

  let extensionDirs = [];

  if (paths.length === 0) {
    const scanBase = path.resolve(process.cwd(), "extensions");
    log(`\n  Scanning ${scanBase} for UI extensions…\n`);
    extensionDirs = discoverUIExtensions(scanBase);
  } else {
    for (const p of paths) {
      const resolved = path.resolve(process.cwd(), p);
      const toml = path.join(resolved, "shopify.extension.toml");
      if (fs.existsSync(toml)) {
        extensionDirs.push(resolved);
      } else if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        extensionDirs.push(...discoverUIExtensions(resolved));
      } else {
        warn(`Path not found: ${resolved}`);
      }
    }
  }

  if (extensionDirs.length === 0) {
    log("\n  No UI extensions found. Nothing to do.");
    process.exit(0);
  }

  log(`  Found ${extensionDirs.length} UI extension(s).\n`);

  const migrated = [];
  for (const dir of extensionDirs) {
    if (migrateUIExtension(dir, targetApiVersion, dryRun)) {
      migrated.push(path.basename(dir));
    }
  }

  // ---------------------------------------------------------------------------
  // Post-migration guidance
  // ---------------------------------------------------------------------------
  if (migrated.length > 0) {
    log("\n╭─────────────────────────────────────────────────────────╮");
    log("│  Post-migration steps                                   │");
    log("╰─────────────────────────────────────────────────────────╯\n");

    log("  1. Install updated dependencies:\n");
    for (const name of migrated) {
      log(`       cd extensions/${name} && npm install`);
    }

    log("\n  2. Review source files for breaking API changes between");
    log("     your previous version and " + targetApiVersion + ".");
    log("     Common things to check:");
    log("       • Hook renames or new required arguments");
    log("       • Component prop changes");
    log("       • Import path changes (if any)");
    log("\n  3. Rebuild and test each extension:\n");
    for (const name of migrated) {
      log(`       cd extensions/${name} && npm run build`);
    }
    log("");
  } else {
    log("\n  No extensions were migrated.");
  }
}

main();
