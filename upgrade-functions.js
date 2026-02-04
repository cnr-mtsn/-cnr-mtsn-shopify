#!/usr/bin/env node
// upgrade-functions.js
//
// ⚠️  DEPRECATED: This script has been superseded by migrate-extensions.js
// Please use: node migrate-extensions.js [path] [--dry-run]
// The new unified script handles both Functions and UI Extensions interactively.
//
// Migrates Shopify Function extensions from legacy purchase.* targets to cart.* targets.
// Usage:
//   node upgrade-functions.js                          # scan ./extensions/
//   node upgrade-functions.js extensions/move-operation # single extension dir
//   node upgrade-functions.js --dry-run                # preview changes without writing

console.log("\n⚠️  DEPRECATED: Please use 'node migrate-extensions.js' instead.\n");

"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Target migration map (confirmed via Shopify dev docs & changelog 2025-07)
// ---------------------------------------------------------------------------
const TARGET_MAP = {
  "purchase.payment-customization.run":        "cart.payment-methods.transform.run",
  "purchase.shipping-discount.run":           "cart.delivery-options.discounts.generate.run",
  "purchase.product-discount.run":            "cart.lines.discounts.generate.run",
  "purchase.order-discount.run":              "cart.lines.discounts.generate.run",
  "purchase.cart-transform.run":              "cart.transform.run",
  "purchase.delivery-customization.run":      "cart.delivery-options.transform.run",
  "purchase.fulfillment-constraint-rule.run": "cart.fulfillment-constraints.generate.run",
  "purchase.order-routing-location-rule.run": "cart.fulfillment-groups.location-rankings.generate.run",
  "purchase.validation.run":                  "cart.validations.generate.run",
  "purchase.validation.fetch":                "cart.validations.generate.fetch",
};

// ---------------------------------------------------------------------------
// Operation-name rewrites (target-specific, keyed by OLD target)
// ---------------------------------------------------------------------------
const OPERATION_RENAMES = {
  "purchase.payment-customization.run": {
    hide:   "paymentMethodHide",
    move:   "paymentMethodMove",
    rename: "paymentMethodRename",
  },
  "purchase.delivery-customization.run": {
    hide:   "deliveryOptionHide",
    move:   "deliveryOptionMove",
    rename: "deliveryOptionRename",
  },
  "purchase.cart-transform.run": {
    expand: "lineExpand",
    merge:  "linesMerge",
    update: "lineUpdate",
  },
  "purchase.fulfillment-constraint-rule.run": {
    mustFulfillFrom:             "deliverableLinesMustFulfillFromAdd",
    mustFulfillFromSameLocation: "deliverableLinesMustFulfillFromSameLocationAdd",
  },
  "purchase.order-routing-location-rule.run": {
    rank: "fulfillmentGroupLocationRankingAdd",
  },
};

// ---------------------------------------------------------------------------
// Naming derivations from a target string
// ---------------------------------------------------------------------------
// Split on every . and - to get segments
function segments(target) {
  return target.split(/[.\-]/);
}

function toSnake(target)  { return segments(target).join("_"); }
function toKebab(target)  { return target.replace(/\./g, "-"); }
function toPascal(target) { return segments(target).map(s => s[0].toUpperCase() + s.slice(1)).join(""); }
function toCamel(target)  { const p = toPascal(target); return p[0].toLowerCase() + p.slice(1); }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function log(msg)      { console.log(msg); }
function warn(msg)     { console.log(`  ⚠  ${msg}`); }
function info(msg)     { console.log(`  →  ${msg}`); }
function success(msg)  { console.log(`  ✓  ${msg}`); }

function readFile(p) { return fs.readFileSync(p, "utf8"); }
function writeFile(p, content) { fs.writeFileSync(p, content, "utf8"); }

// ---------------------------------------------------------------------------
// TOML parser — minimal, just enough to extract & rewrite [[extensions.targeting]]
// We do line-based rewriting rather than a full parse to preserve formatting/comments.
// ---------------------------------------------------------------------------
function extractTarget(tomlContent) {
  const match = tomlContent.match(/target\s*=\s*"([^"]+)"/);
  return match ? match[1] : null;
}

function rewriteToml(content, oldTarget, newTarget) {
  const snake = toSnake(newTarget);
  const kebab = toKebab(newTarget);

  let out = content;
  // target = "..."
  out = out.replace(
    /(\s*target\s*=\s*)"[^"]*"/,
    `$1"${newTarget}"`
  );
  // input_query = "src/run.graphql"  →  "src/{snake}.graphql"
  out = out.replace(
    /(\s*input_query\s*=\s*)"[^"]*"/,
    `$1"src/${snake}.graphql"`
  );
  // export = "run"  →  kebab
  out = out.replace(
    /(\s*export\s*=\s*)"[^"]*"/,
    `$1"${kebab}"`
  );
  return out;
}

// ---------------------------------------------------------------------------
// package.json — strip javy
// ---------------------------------------------------------------------------
function migratePackageJson(pkgPath) {
  const raw = readFile(pkgPath);
  let pkg;
  try { pkg = JSON.parse(raw); } catch { return { changed: false }; }

  if (!pkg.dependencies || !pkg.dependencies.javy) return { changed: false };

  delete pkg.dependencies.javy;
  // Preserve trailing newline if original had one
  const trailing = raw.endsWith("\n") ? "\n" : "";
  const out = JSON.stringify(pkg, null, 2) + trailing;
  return { changed: true, content: out };
}

// ---------------------------------------------------------------------------
// .graphql — rename query
// ---------------------------------------------------------------------------
function migrateGraphql(content, newTarget) {
  const pascal = toPascal(newTarget);
  // Replace `query RunInput` or `query <anything>Input` with the new name
  return content.replace(
    /query\s+\w+Input/,
    `query ${pascal}Input`
  );
}

// ---------------------------------------------------------------------------
// .js main file — rename function, rewrite JSDoc types, rewrite operation keys
// ---------------------------------------------------------------------------
function migrateJs(content, oldTarget, newTarget) {
  const pascal = toPascal(newTarget);
  const camel  = toCamel(newTarget);

  let out = content;

  // JSDoc @typedef RunInput  →  {Pascal}Input
  out = out.replace(/RunInput/g, `${pascal}Input`);
  // JSDoc FunctionRunResult / FunctionResult  →  {Pascal}Result
  out = out.replace(/FunctionRunResult/g, `${pascal}Result`);
  out = out.replace(/FunctionResult/g,    `${pascal}Result`);

  // export function run(  →  export function {camel}(
  out = out.replace(
    /export\s+function\s+run\b/,
    `export function ${camel}`
  );

  // Comment referencing old target
  out = out.replace(
    new RegExp(`'${oldTarget.replace(/\./g, "\\.")}'`, "g"),
    `'${newTarget}'`
  );

  // Operation key renames (target-specific)
  const renames = OPERATION_RENAMES[oldTarget];
  if (renames) {
    for (const [oldOp, newOp] of Object.entries(renames)) {
      // Match the operation key in object literals: { hide: { … } }
      // We look for the key followed by : and whitespace/newline — but NOT inside strings.
      // Use a word-boundary-aware pattern: the key appears as a standalone identifier
      // followed by a colon (possibly with trailing whitespace).
      const pattern = new RegExp(`(\\{\\s*|,\\s*|^\\s*)${oldOp}(\\s*:)`, "gm");
      out = out.replace(pattern, `$1${newOp}$2`);
    }
  }

  // Shipping-discount specific: { discounts: [] } → { operations: [] }
  if (oldTarget === "purchase.shipping-discount.run") {
    out = out.replace(/discounts\s*:/g, "operations:");
    // Restructure the discount output shape is too complex for regex on arbitrary code;
    // we flag it in the summary so the developer reviews manually if the pattern isn't
    // exactly what we expect. We DO handle the common flat→nested restructure below.
    out = rewriteShippingDiscountOutput(out);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Depth-tracking helpers for the shipping-discount structural rewrite
// ---------------------------------------------------------------------------

// Return the index of the closing } or ] that matches the opener at `pos`.
// Correctly skips over string and template-literal contents.
function findBalancedEnd(str, pos) {
  const open  = str[pos];
  const close = open === '{' ? '}' : ']';
  let depth = 0, i = pos;
  while (i < str.length) {
    const ch = str[i];
    if      (ch === '"'  || ch === "'") { i = skipQuoted(str, i); continue; }
    else if (ch === '`')               { i = skipTemplate(str, i); continue; }
    if      (ch === open)              depth++;
    else if (ch === close)             { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

function skipQuoted(str, pos) {
  const q = str[pos]; let i = pos + 1;
  while (i < str.length) {
    if (str[i] === '\\') { i += 2; continue; }
    if (str[i] === q)    return i + 1;
    i++;
  }
  return i;
}

function skipTemplate(str, pos) {
  let i = pos + 1;
  while (i < str.length) {
    if (str[i] === '\\')                      { i += 2; continue; }
    if (str[i] === '$' && str[i + 1] === '{') {
      i += 2; let d = 1;
      while (i < str.length && d > 0) {
        if   (str[i] === '{') d++;
        else if (str[i] === '}') d--;
        i++;
      }
      continue;
    }
    if (str[i] === '`') return i + 1;
    i++;
  }
  return i;
}

// Find a top-level property in `body` (text between { and }, braces excluded)
// and return { value: <raw expression text> }, or null.
// Correctly skips nested objects/arrays so inner properties with the same name
// are not matched.
function extractProp(body, name) {
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++;
    if (i >= body.length) break;

    if (body.substring(i, i + name.length) === name) {
      let j = i + name.length;
      while (j < body.length && body[j] === ' ') j++;
      if (body[j] === ':') {
        j++;
        while (j < body.length && body[j] === ' ') j++;
        let end;
        if      (body[j] === '{') end = findBalancedEnd(body, j) + 1;
        else if (body[j] === '[') end = findBalancedEnd(body, j) + 1;
        else if (body[j] === '`') end = skipTemplate(body, j);
        else if (body[j] === '"' || body[j] === "'") end = skipQuoted(body, j);
        else {
          end = j;
          while (end < body.length && body[end] !== ',' && body[end] !== '\n') end++;
        }
        return { value: body.substring(j, end) };
      }
    }

    // Advance past the current token, skipping structured values wholesale
    if (body[i] === '{') { i = findBalancedEnd(body, i) + 1; continue; }
    if (body[i] === '[') { i = findBalancedEnd(body, i) + 1; continue; }
    if (body[i] === '`') { i = skipTemplate(body, i); continue; }
    if (body[i] === '"' || body[i] === "'") { i = skipQuoted(body, i); continue; }
    while (i < body.length && !/[\s{[\`"',}\]]/.test(body[i])) i++;
    if (i < body.length && (body[i] === ',' || body[i] === ':')) i++;
  }
  return null;
}

// Prepend extraIndent to every line after the first (first line stays inline with its key)
function reindentLines(text, extra) {
  return text.split('\n').map((line, idx) =>
    idx === 0 || line.trim() === '' ? line : extra + line
  ).join('\n');
}

function detectIndentUnit(content) {
  return content.includes('\n\t') ? '\t' : '  ';
}

// Rewrite shipping discount output from flat { value, targets, message }
// to nested { deliveryDiscountsAdd: { selectionStrategy, candidates: [...] } }.
// Iterates over every `operations: [` in the file; the first one whose array
// element has the flat shape gets rewritten.  Already-migrated files or files
// with an unexpected shape are left untouched.
function rewriteShippingDiscountOutput(content) {
  if (content.includes('deliveryDiscountsAdd')) return content;

  const unit = detectIndentUnit(content);
  let searchFrom = 0;

  while (searchFrom < content.length) {
    const idx = content.indexOf('operations:', searchFrom);
    if (idx === -1) break;

    // advance to the [ after "operations:"
    let bi = idx + 'operations:'.length;
    while (bi < content.length && /\s/.test(content[bi])) bi++;
    if (content[bi] !== '[') { searchFrom = bi; continue; }

    // find the first { inside the array (empty arrays have ] immediately)
    let elemStart = -1;
    for (let i = bi + 1; i < content.length; i++) {
      if (content[i] === '{') { elemStart = i; break; }
      if (content[i] === ']') break;
      if (!/\s/.test(content[i])) break;
    }
    if (elemStart === -1) { searchFrom = bi + 1; continue; }

    const elemEnd = findBalancedEnd(content, elemStart);
    if (elemEnd === -1) { searchFrom = elemStart + 1; continue; }

    const body = content.substring(elemStart + 1, elemEnd);

    // must have flat shape: value + targets + message, must NOT already be wrapped
    if (body.includes('deliveryDiscountsAdd')) { searchFrom = elemEnd + 1; continue; }
    const valueP   = extractProp(body, 'value');
    const targetsP = extractProp(body, 'targets');
    const messageP = extractProp(body, 'message');
    if (!valueP || !targetsP || !messageP) { searchFrom = elemEnd + 1; continue; }

    // --- indentation context ---
    let ls = elemStart;
    while (ls > 0 && content[ls - 1] !== '\n') ls--;
    const elemIndent = content.substring(ls, elemStart).match(/^(\s*)/)[1];
    const i1 = elemIndent + unit;          // deliveryDiscountsAdd:
    const i2 = i1 + unit;                  // selectionStrategy:, candidates:
    const i3 = i2 + unit;                  // candidate object {
    const i4 = i3 + unit;                  // targets:, value:, message:, associatedDiscountCode:
    const extra = unit.repeat(3);          // sub-blocks shift: from property-level to candidate-level

    const newElem =
      elemIndent + '{\n' +
      i1 + 'deliveryDiscountsAdd: {\n' +
      i2 + 'selectionStrategy: "ALL",\n' +
      i2 + 'candidates: [\n' +
      i3 + '{\n' +
      i4 + 'targets: '              + reindentLines(targetsP.value, extra) + ',\n' +
      i4 + 'value: '                + reindentLines(valueP.value,   extra) + ',\n' +
      i4 + 'message: '              + messageP.value.trim()                + ',\n' +
      i4 + 'associatedDiscountCode: null,\n' +
      i3 + '},\n' +
      i2 + '],\n' +
      i1 + '},\n' +
      elemIndent + '}';

    return content.substring(0, ls) + newElem + content.substring(elemEnd + 1);
  }

  return content;
}

// ---------------------------------------------------------------------------
// .test.js — update import path, function name, JSDoc type, call site, assertion shape
// ---------------------------------------------------------------------------
function migrateTest(content, oldTarget, newTarget) {
  const pascal = toPascal(newTarget);
  const camel  = toCamel(newTarget);
  const snake  = toSnake(newTarget);

  let out = content;

  // import { run } from './run'  →  import { camel } from './{snake}'
  out = out.replace(
    /import\s*\{\s*run\s*\}\s*from\s*['"][^'"]*['"]/,
    `import { ${camel} } from './${snake}'`
  );

  // JSDoc types
  out = out.replace(/FunctionRunResult/g, `${pascal}Result`);
  out = out.replace(/FunctionResult/g,    `${pascal}Result`);
  out = out.replace(/RunInput/g,          `${pascal}Input`);

  // Function call: run({ … })  →  camel({ … })
  // Match `run(` that is NOT part of `import` or `from`
  out = out.replace(/\brun\(/g, `${camel}(`);

  // Shipping discount: assertion { discounts: [] }  →  { operations: [] }
  if (oldTarget === "purchase.shipping-discount.run") {
    out = out.replace(/discounts\s*:\s*\[\s*\]/g, "operations: []");
  }

  return out;
}

// ---------------------------------------------------------------------------
// index.js — rewrite re-export path
// ---------------------------------------------------------------------------
function migrateIndex(content, newTarget) {
  const snake = toSnake(newTarget);
  return content.replace(
    /export\s*\*\s*from\s*['"][^'"]*['"]/,
    `export * from './${snake}'`
  );
}

// ---------------------------------------------------------------------------
// Core: process one extension directory
// ---------------------------------------------------------------------------
function migrateExtension(extDir, dryRun) {
  const tomlPath = path.join(extDir, "shopify.extension.toml");
  if (!fs.existsSync(tomlPath)) {
    warn(`No shopify.extension.toml found in ${extDir} — skipping`);
    return false;
  }

  const tomlContent = readFile(tomlPath);
  const oldTarget   = extractTarget(tomlContent);
  if (!oldTarget) {
    warn(`Could not parse target from ${tomlPath} — skipping`);
    return false;
  }

  const newTarget = TARGET_MAP[oldTarget];
  if (!newTarget) {
    warn(`No migration known for target "${oldTarget}" — skipping`);
    return false;
  }

  const oldSnake = "run";                // legacy files are always src/run.*
  const newSnake = toSnake(newTarget);

  log(`\n  Extension: ${path.basename(extDir)}`);
  log(`  ${oldTarget}  →  ${newTarget}\n`);

  const changes = []; // accumulate { description, apply() }

  // --- package.json ---
  const pkgPath = path.join(extDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    const { changed, content } = migratePackageJson(pkgPath);
    if (changed) {
      changes.push({
        desc: "package.json — removed javy dependency",
        apply: () => writeFile(pkgPath, content),
      });
    }
  }

  // --- shopify.extension.toml ---
  {
    const newToml = rewriteToml(tomlContent, oldTarget, newTarget);
    changes.push({
      desc: `shopify.extension.toml — target, input_query, export updated`,
      apply: () => writeFile(tomlPath, newToml),
    });
  }

  // --- rename src/run.{graphql,js,test.js} and rewrite contents ---
  const srcDir = path.join(extDir, "src");

  // .graphql
  const oldGql = path.join(srcDir, `${oldSnake}.graphql`);
  const newGql = path.join(srcDir, `${newSnake}.graphql`);
  if (fs.existsSync(oldGql)) {
    const gqlContent = migrateGraphql(readFile(oldGql), newTarget);
    changes.push({
      desc: `src/${oldSnake}.graphql → src/${newSnake}.graphql  (query name updated)`,
      apply: () => { writeFile(newGql, gqlContent); if (oldGql !== newGql) fs.unlinkSync(oldGql); },
    });
  }

  // .js (main)
  const oldJs = path.join(srcDir, `${oldSnake}.js`);
  const newJs = path.join(srcDir, `${newSnake}.js`);
  if (fs.existsSync(oldJs)) {
    const jsContent = migrateJs(readFile(oldJs), oldTarget, newTarget);
    changes.push({
      desc: `src/${oldSnake}.js → src/${newSnake}.js  (function name, types, operations updated)`,
      apply: () => { writeFile(newJs, jsContent); if (oldJs !== newJs) fs.unlinkSync(oldJs); },
    });
  }

  // .test.js
  const oldTest = path.join(srcDir, `${oldSnake}.test.js`);
  const newTest = path.join(srcDir, `${newSnake}.test.js`);
  if (fs.existsSync(oldTest)) {
    const testContent = migrateTest(readFile(oldTest), oldTarget, newTarget);
    changes.push({
      desc: `src/${oldSnake}.test.js → src/${newSnake}.test.js  (import, call, types updated)`,
      apply: () => { writeFile(newTest, testContent); if (oldTest !== newTest) fs.unlinkSync(oldTest); },
    });
  }

  // --- index.js ---
  const indexPath = path.join(srcDir, "index.js");
  if (fs.existsSync(indexPath)) {
    const newIndex = migrateIndex(readFile(indexPath), newTarget);
    changes.push({
      desc: `src/index.js — re-export path updated to ./${newSnake}`,
      apply: () => writeFile(indexPath, newIndex),
    });
  }

  // --- Print summary & apply ---
  changes.forEach(c => info(c.desc));

  if (oldTarget === "purchase.shipping-discount.run") {
    warn(`Shipping discount: output restructured from flat discounts[] to\n` +
         `         operations[].deliveryDiscountsAdd.  Review src/${newSnake}.js\n` +
         `         to confirm the nesting matches your business logic.`);
  }

  if (!dryRun) {
    changes.forEach(c => c.apply());
    success("Changes written.");
  } else {
    log("\n  (dry run — no files written)");
  }

  return true;
}

// ---------------------------------------------------------------------------
// Discovery: find all Function extensions under a directory
// ---------------------------------------------------------------------------
function discoverFunctionExtensions(baseDir) {
  const results = [];
  if (!fs.existsSync(baseDir)) return results;

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const toml = path.join(baseDir, entry.name, "shopify.extension.toml");
    if (!fs.existsSync(toml)) continue;
    const content = readFile(toml);
    if (/type\s*=\s*"function"/.test(content)) {
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
  const paths  = args.filter(a => !a.startsWith("--"));

  log("╭─────────────────────────────────────────────────────────╮");
  log("│  Shopify Functions API Version Migration Tool                │");
  log("│  purchase.* → cart.*  (2025-07 / 2026-01 targets)            │");
  log("╰─────────────────────────────────────────────────────────╯");
  if (dryRun) log("\n  Mode: DRY RUN — no files will be written\n");

  let extensionDirs = [];

  if (paths.length === 0) {
    // Auto-scan ./extensions/
    const scanBase = path.resolve(process.cwd(), "extensions");
    log(`\n  Scanning ${scanBase} for Function extensions…\n`);
    extensionDirs = discoverFunctionExtensions(scanBase);
  } else {
    // Treat each path arg as either a single extension dir or a parent to scan
    for (const p of paths) {
      const resolved = path.resolve(process.cwd(), p);
      const toml = path.join(resolved, "shopify.extension.toml");
      if (fs.existsSync(toml)) {
        extensionDirs.push(resolved);
      } else if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        extensionDirs.push(...discoverFunctionExtensions(resolved));
      } else {
        warn(`Path not found or not a directory: ${resolved}`);
      }
    }
  }

  if (extensionDirs.length === 0) {
    log("\n  No Function extensions found. Nothing to do.");
    process.exit(0);
  }

  log(`  Found ${extensionDirs.length} Function extension(s).\n`);

  const migrated = [];
  for (const dir of extensionDirs) {
    if (migrateExtension(dir, dryRun)) {
      migrated.push(path.basename(dir));
    }
  }

  // ---------------------------------------------------------------------------
  // Post-migration reminder
  // ---------------------------------------------------------------------------
  if (migrated.length > 0) {
    log("\n╭─────────────────────────────────────────────────────────╮");
    log("│  Post-migration steps                                          │");
    log("╰─────────────────────────────────────────────────────────╯\n");
    log("  Run typegen for each migrated extension to regenerate");
    log("  schema.graphql and generated/api.ts:\n");
    for (const name of migrated) {
      log(`    cd extensions/${name} && shopify app function typegen`);
    }
    log("");
  } else {
    log("\n  No extensions were migrated.");
  }
}

main();
