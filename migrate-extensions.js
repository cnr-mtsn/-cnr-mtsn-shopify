#!/usr/bin/env node
// migrate-extensions.js
// Unified Shopify Extensions Migration Tool
// Migrates both Shopify Functions and UI Extensions to API version 2026-01
//
// Usage:
//   node migrate-extensions.js                           # scan ./extensions/ interactively
//   node migrate-extensions.js extensions/my-extension   # single extension
//   node migrate-extensions.js --dry-run                 # preview changes without writing
//   node migrate-extensions.js --auto-approve            # skip prompts (dangerous!)
//   node migrate-extensions.js --api-version 2026-01     # specify API version (default: 2026-01)
//   node migrate-extensions.js --force                   # re-migrate even if already at target version

"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execSync } = require("child_process");

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_API_VERSION = "2026-01";
const MIGRATION_LOG_FILE = "migration.json";

// Function target migration map (purchase.* → cart.*)
const FUNCTION_TARGET_MAP = {
  // Payment customization
  "purchase.payment-customization.run": "cart.payment-methods.transform.run",
  // Shipping/Delivery discounts
  "purchase.shipping-discount.run": "cart.delivery-options.discounts.generate.run",
  // Product/Order discounts → cart lines discounts
  "purchase.product-discount.run": "cart.lines.discounts.generate.run",
  "purchase.order-discount.run": "cart.lines.discounts.generate.run",
  // Cart transform
  "purchase.cart-transform.run": "cart.transform.run",
  // Delivery customization
  "purchase.delivery-customization.run": "cart.delivery-options.transform.run",
  "purchase.delivery-customization.fetch": "cart.delivery-options.transform.fetch",
  // Fulfillment constraints
  "purchase.fulfillment-constraint-rule.run": "cart.fulfillment-constraints.generate.run",
  // Order routing
  "purchase.order-routing-location-rule.run": "cart.fulfillment-groups.location-rankings.generate.run",
  // Validation
  "purchase.validation.run": "cart.validations.generate.run",
  "purchase.validation.fetch": "cart.validations.generate.fetch",
};

// Operation key renames per function target
const FUNCTION_OPERATION_RENAMES = {
  "purchase.payment-customization.run": {
    hide: "paymentMethodHide",
    move: "paymentMethodMove",
    rename: "paymentMethodRename",
  },
  "purchase.delivery-customization.run": {
    hide: "deliveryOptionHide",
    move: "deliveryOptionMove",
    rename: "deliveryOptionRename",
  },
  "purchase.cart-transform.run": {
    expand: "lineExpand",
    merge: "linesMerge",
    update: "lineUpdate",
  },
  "purchase.fulfillment-constraint-rule.run": {
    mustFulfillFrom: "deliverableLinesMustFulfillFromAdd",
    mustFulfillFromSameLocation: "deliverableLinesMustFulfillFromSameLocationAdd",
  },
  "purchase.order-routing-location-rule.run": {
    rank: "fulfillmentGroupLocationRankingAdd",
  },
};

// React component → Web component mapping
const COMPONENT_MAP = {
  // Layout & Structure
  View: "s-box",
  Box: "s-box",
  BlockStack: "s-stack",
  InlineStack: "s-stack",
  BlockLayout: "s-grid",
  InlineLayout: "s-grid",
  Grid: "s-grid",
  GridItem: "s-grid-item",
  BlockSpacer: "s-box",
  InlineSpacer: "s-box",
  ScrollView: "s-scroll-box",
  HeadingGroup: "s-section",

  // Text & Titles
  Text: "s-text",
  TextBlock: "s-paragraph",
  Heading: "s-heading",
  Badge: "s-badge",

  // Forms
  TextField: "s-text-field",
  Checkbox: "s-checkbox",
  Select: "s-select",
  ChoiceList: "s-choice-list",
  Choice: "s-choice",
  PhoneField: "s-phone-field",
  DateField: "s-date-field",
  DatePicker: "s-date-picker",
  Form: "s-form",
  Stepper: "s-number-field",
  Switch: "s-switch",
  DropZone: "s-drop-zone",

  // Actions
  Button: "s-button",
  Link: "s-link",
  Pressable: "s-clickable",

  // Feedback
  Banner: "s-banner",
  Spinner: "s-spinner",
  Progress: "s-progress",
  SkeletonText: "s-skeleton-paragraph",
  SkeletonTextBlock: "s-skeleton-paragraph",

  // Media
  Icon: "s-icon",
  Image: "s-image",
  ProductThumbnail: "s-product-thumbnail",
  PaymentIcon: "s-payment-icon",
  QRCode: "s-qr-code",

  // Overlays
  Modal: "s-modal",
  Popover: "s-popover",
  Sheet: "s-sheet",
  Tooltip: "s-tooltip",
  Disclosure: "s-details",

  // Lists
  List: "s-unordered-list",
  ListItem: "s-list-item",

  // Other
  Divider: "s-divider",
  Map: "s-map",
  MapMarker: "s-map-marker",
  Tag: "s-chip",
  ToggleButton: "s-press-button",
  ClipboardItem: "s-clipboard-item",
  ConsentCheckbox: "s-consent-checkbox",
  ConsentPhoneField: "s-consent-phone-field",

  // Customer Account specific
  Card: "s-section",
  Avatar: "s-avatar",
  CustomerAccountAction: "s-customer-account-action",
  Menu: "s-menu",
  Page: "s-page",
  ImageGroup: "s-image-group",
};

// React hooks → shopify.* API mapping
const HOOK_TO_API_MAP = {
  useCartLines: "shopify.lines.value",
  useSettings: "shopify.settings.value",
  useTranslate: "shopify.i18n.translate",
  useInstructions: "shopify.instructions.value",
  useDeliveryGroups: "shopify.deliveryGroups.value",
  useApplyAttributeChange: "shopify.applyAttributeChange",
  useBuyerJourneyIntercept: "shopify.buyerJourney.intercept",
  useExtensionCapability: "shopify.extension.capabilities",
  useApi: "shopify",
  useShop: "shopify.shop.value",
  useCustomer: "shopify.customer.value",
  useShippingAddress: "shopify.shippingAddress.value",
  useBillingAddress: "shopify.billingAddress.value",
  useCheckoutToken: "shopify.checkoutToken.value",
  useCurrency: "shopify.currency.value",
  useLanguage: "shopify.language.value",
  useLocale: "shopify.locale.value",
  useMetafield: "shopify.metafields.value",
  useApplyCartLinesChange: "shopify.applyCartLinesChange",
  useApplyDiscountCodeChange: "shopify.applyDiscountCodeChange",
  useApplyGiftCardChange: "shopify.applyGiftCardChange",
  useApplyShippingAddressChange: "shopify.applyShippingAddressChange",
  useCartLineTarget: "shopify.target.value",
  useOrder: "shopify.order.value",
  useOrderStatus: "shopify.orderStatus.value",
};

// =============================================================================
// Logging & UI Helpers
// =============================================================================

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(msg) { console.log(msg); }
function warn(msg) { console.log(`${colors.yellow}  ⚠  ${msg}${colors.reset}`); }
function info(msg) { console.log(`${colors.cyan}  →  ${msg}${colors.reset}`); }
function success(msg) { console.log(`${colors.green}  ✓  ${msg}${colors.reset}`); }
function error(msg) { console.log(`${colors.red}  ✗  ${msg}${colors.reset}`); }

function readFile(p) { return fs.readFileSync(p, "utf8"); }
function writeFile(p, content) { fs.writeFileSync(p, content, "utf8"); }

// Recursively find all files matching a filter in a directory
function findFilesRecursive(dir, filter) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and dist directories
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
      results.push(...findFilesRecursive(fullPath, filter));
    } else if (filter(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().trim());
    });
  });
}

async function confirm(message) {
  const answer = await prompt(`${colors.bright}${message} [y/n]: ${colors.reset}`);
  return answer === "y" || answer === "yes";
}

// =============================================================================
// Naming Helpers
// =============================================================================

function segments(target) {
  return target.split(/[.\-]/);
}

function toSnake(target) { return segments(target).join("_"); }
function toKebab(target) { return target.replace(/\./g, "-"); }
function toPascal(target) { return segments(target).map(s => s[0].toUpperCase() + s.slice(1)).join(""); }
function toCamel(target) { const p = toPascal(target); return p[0].toLowerCase() + p.slice(1); }

function apiVersionToPackageVersion(apiVersion) {
  const [year, month] = apiVersion.split("-");
  return `${year}.${month}.x`;
}

// =============================================================================
// TOML Helpers
// =============================================================================

function extractTarget(tomlContent) {
  const match = tomlContent.match(/target\s*=\s*"([^"]+)"/);
  return match ? match[1] : null;
}

function extractApiVersion(tomlContent) {
  const m = tomlContent.match(/api_version\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function extractExtensionType(tomlContent) {
  const m = tomlContent.match(/type\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function rewriteApiVersion(tomlContent, newVersion) {
  return tomlContent.replace(
    /(api_version\s*=\s*)"[^"]*"/,
    `$1"${newVersion}"`
  );
}

function rewriteFunctionToml(content, oldTarget, newTarget) {
  const snake = toSnake(newTarget);
  const kebab = toKebab(newTarget);

  let out = content;
  out = out.replace(
    /(\s*target\s*=\s*)"[^"]*"/,
    `$1"${newTarget}"`
  );
  out = out.replace(
    /(\s*input_query\s*=\s*)"[^"]*"/,
    `$1"src/${snake}.graphql"`
  );
  out = out.replace(
    /(\s*export\s*=\s*)"[^"]*"/,
    `$1"${kebab}"`
  );
  return out;
}

// =============================================================================
// Function Migration Helpers
// =============================================================================

function migrateGraphql(content, newTarget) {
  const pascal = toPascal(newTarget);
  return content.replace(
    /query\s+\w+Input/,
    `query ${pascal}Input`
  );
}

function migrateFunctionJs(content, oldTarget, newTarget) {
  const pascal = toPascal(newTarget);
  const camel = toCamel(newTarget);

  let out = content;

  // JSDoc types
  out = out.replace(/RunInput/g, `${pascal}Input`);
  out = out.replace(/FunctionRunResult/g, `${pascal}Result`);
  out = out.replace(/FunctionResult/g, `${pascal}Result`);

  // Function name
  out = out.replace(
    /export\s+function\s+run\b/,
    `export function ${camel}`
  );

  // Target reference in comments
  out = out.replace(
    new RegExp(`'${oldTarget.replace(/\./g, "\\.")}'`, "g"),
    `'${newTarget}'`
  );

  // Operation key renames
  const renames = FUNCTION_OPERATION_RENAMES[oldTarget];
  if (renames) {
    for (const [oldOp, newOp] of Object.entries(renames)) {
      const pattern = new RegExp(`(\\{\\s*|,\\s*|^\\s*)${oldOp}(\\s*:)`, "gm");
      out = out.replace(pattern, `$1${newOp}$2`);
    }
  }

  // Shipping discount special handling
  if (oldTarget === "purchase.shipping-discount.run") {
    out = out.replace(/discounts\s*:/g, "operations:");
    out = rewriteShippingDiscountOutput(out);
  }

  return out;
}

function migrateFunctionTest(content, oldTarget, newTarget) {
  const pascal = toPascal(newTarget);
  const camel = toCamel(newTarget);
  const snake = toSnake(newTarget);

  let out = content;

  out = out.replace(
    /import\s*\{\s*run\s*\}\s*from\s*['"][^'"]*['"]/,
    `import { ${camel} } from './${snake}'`
  );

  out = out.replace(/FunctionRunResult/g, `${pascal}Result`);
  out = out.replace(/FunctionResult/g, `${pascal}Result`);
  out = out.replace(/RunInput/g, `${pascal}Input`);
  out = out.replace(/\brun\(/g, `${camel}(`);

  if (oldTarget === "purchase.shipping-discount.run") {
    out = out.replace(/discounts\s*:\s*\[\s*\]/g, "operations: []");
  }

  return out;
}

function migrateFunctionIndex(content, newTarget) {
  const snake = toSnake(newTarget);
  return content.replace(
    /export\s*\*\s*from\s*['"][^'"]*['"]/,
    `export * from './${snake}'`
  );
}

function migrateFunctionPackageJson(pkgPath) {
  const raw = readFile(pkgPath);
  let pkg;
  try { pkg = JSON.parse(raw); } catch { return { changed: false }; }

  if (!pkg.dependencies || !pkg.dependencies.javy) return { changed: false };

  delete pkg.dependencies.javy;
  const trailing = raw.endsWith("\n") ? "\n" : "";
  return { changed: true, content: JSON.stringify(pkg, null, 2) + trailing };
}

// Shipping discount output restructuring helpers
function findBalancedEnd(str, pos) {
  const open = str[pos];
  const close = open === '{' ? '}' : ']';
  let depth = 0, i = pos;
  while (i < str.length) {
    const ch = str[i];
    if (ch === '"' || ch === "'") { i = skipQuoted(str, i); continue; }
    else if (ch === '`') { i = skipTemplate(str, i); continue; }
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

function skipQuoted(str, pos) {
  const q = str[pos]; let i = pos + 1;
  while (i < str.length) {
    if (str[i] === '\\') { i += 2; continue; }
    if (str[i] === q) return i + 1;
    i++;
  }
  return i;
}

function skipTemplate(str, pos) {
  let i = pos + 1;
  while (i < str.length) {
    if (str[i] === '\\') { i += 2; continue; }
    if (str[i] === '$' && str[i + 1] === '{') {
      i += 2; let d = 1;
      while (i < str.length && d > 0) {
        if (str[i] === '{') d++;
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
        if (body[j] === '{') end = findBalancedEnd(body, j) + 1;
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

    if (body[i] === '{') { i = findBalancedEnd(body, i) + 1; continue; }
    if (body[i] === '[') { i = findBalancedEnd(body, i) + 1; continue; }
    if (body[i] === '`') { i = skipTemplate(body, i); continue; }
    if (body[i] === '"' || body[i] === "'") { i = skipQuoted(body, i); continue; }
    while (i < body.length && !/[\s{[\`"',}\]]/.test(body[i])) i++;
    if (i < body.length && (body[i] === ',' || body[i] === ':')) i++;
  }
  return null;
}

function reindentLines(text, extra) {
  return text.split('\n').map((line, idx) =>
    idx === 0 || line.trim() === '' ? line : extra + line
  ).join('\n');
}

function detectIndentUnit(content) {
  return content.includes('\n\t') ? '\t' : '  ';
}

function rewriteShippingDiscountOutput(content) {
  if (content.includes('deliveryDiscountsAdd')) return content;

  const unit = detectIndentUnit(content);
  let searchFrom = 0;

  while (searchFrom < content.length) {
    const idx = content.indexOf('operations:', searchFrom);
    if (idx === -1) break;

    let bi = idx + 'operations:'.length;
    while (bi < content.length && /\s/.test(content[bi])) bi++;
    if (content[bi] !== '[') { searchFrom = bi; continue; }

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

    if (body.includes('deliveryDiscountsAdd')) { searchFrom = elemEnd + 1; continue; }
    const valueP = extractProp(body, 'value');
    const targetsP = extractProp(body, 'targets');
    const messageP = extractProp(body, 'message');
    if (!valueP || !targetsP || !messageP) { searchFrom = elemEnd + 1; continue; }

    let ls = elemStart;
    while (ls > 0 && content[ls - 1] !== '\n') ls--;
    const elemIndent = content.substring(ls, elemStart).match(/^(\s*)/)[1];
    const i1 = elemIndent + unit;
    const i2 = i1 + unit;
    const i3 = i2 + unit;
    const i4 = i3 + unit;
    const extra = unit.repeat(3);

    const newElem =
      elemIndent + '{\n' +
      i1 + 'deliveryDiscountsAdd: {\n' +
      i2 + 'selectionStrategy: "ALL",\n' +
      i2 + 'candidates: [\n' +
      i3 + '{\n' +
      i4 + 'targets: ' + reindentLines(targetsP.value, extra) + ',\n' +
      i4 + 'value: ' + reindentLines(valueP.value, extra) + ',\n' +
      i4 + 'message: ' + messageP.value.trim() + ',\n' +
      i4 + 'associatedDiscountCode: null,\n' +
      i3 + '},\n' +
      i2 + '],\n' +
      i1 + '},\n' +
      elemIndent + '}';

    return content.substring(0, ls) + newElem + content.substring(elemEnd + 1);
  }

  return content;
}

// =============================================================================
// UI Extension Migration Helpers
// =============================================================================

function migrateUIPackageJson(pkgPath, targetPkgVersion) {
  const raw = readFile(pkgPath);
  let pkg;
  try { pkg = JSON.parse(raw); } catch { return { changed: false, changes: [] }; }

  const changes = [];

  // Remove React-related dependencies
  const depsToRemove = ["react", "@shopify/ui-extensions-react", "react-reconciler"];
  const devDepsToRemove = ["@types/react"];

  ["dependencies", "devDependencies"].forEach(section => {
    if (pkg[section]) {
      depsToRemove.concat(devDepsToRemove).forEach(dep => {
        if (pkg[section][dep]) {
          delete pkg[section][dep];
          changes.push(`removed ${dep} from ${section}`);
        }
      });
    }
  });

  // Add Preact dependencies
  if (!pkg.dependencies) pkg.dependencies = {};

  if (!pkg.dependencies.preact) {
    pkg.dependencies.preact = "^10.10.0";
    changes.push(`added preact ^10.10.0`);
  }

  if (!pkg.dependencies["@preact/signals"]) {
    pkg.dependencies["@preact/signals"] = "^2.3.0";
    changes.push(`added @preact/signals ^2.3.0`);
  }

  // Update @shopify/ui-extensions
  if (pkg.dependencies["@shopify/ui-extensions"]) {
    const old = pkg.dependencies["@shopify/ui-extensions"];
    if (old !== targetPkgVersion) {
      pkg.dependencies["@shopify/ui-extensions"] = targetPkgVersion;
      changes.push(`@shopify/ui-extensions ${old} → ${targetPkgVersion}`);
    }
  } else {
    pkg.dependencies["@shopify/ui-extensions"] = targetPkgVersion;
    changes.push(`added @shopify/ui-extensions ${targetPkgVersion}`);
  }

  if (changes.length === 0) return { changed: false, changes };

  const trailing = raw.endsWith("\n") ? "\n" : "";
  return { changed: true, content: JSON.stringify(pkg, null, 2) + trailing, changes };
}

function migrateUISourceFile(content, extensionType) {
  let out = content;
  const warnings = [];

  // Determine surface (checkout or customer-account)
  const surface = extensionType === "customer-account" ? "customer-account" : "checkout";

  // Transform imports
  // Remove React imports
  out = out.replace(/import\s+React(?:\s*,\s*\{[^}]*\})?\s+from\s+["']react["'];?\n?/g, "");
  out = out.replace(/import\s+\{[^}]*\}\s+from\s+["']react["'];?\n?/g, "");

  // Transform @shopify/ui-extensions-react imports
  const uiExtensionsReactImportRegex = /import\s*\{([^}]+)\}\s*from\s*["']@shopify\/ui-extensions-react\/(?:checkout|customer-account)["'];?\n?/g;
  let reactImportMatch;
  const importedComponents = [];
  const importedHooks = [];

  while ((reactImportMatch = uiExtensionsReactImportRegex.exec(content)) !== null) {
    const imports = reactImportMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    imports.forEach(imp => {
      // Check if it's a hook (starts with 'use' or is reactExtension)
      if (imp.startsWith('use') || imp === 'reactExtension') {
        importedHooks.push(imp);
      } else {
        importedComponents.push(imp);
      }
    });
  }

  // Remove old imports
  out = out.replace(/import\s*\{[^}]+\}\s*from\s*["']@shopify\/ui-extensions-react\/(?:checkout|customer-account)["'];?\n?/g, "");

  // Add new Preact imports at the top
  const newImports = [
    `import '@shopify/ui-extensions/preact';`,
    `import { render } from 'preact';`,
  ];

  // Add preact/hooks if useState/useEffect/etc were used
  const preactHooks = [];
  if (content.includes('useState')) preactHooks.push('useState');
  if (content.includes('useEffect')) preactHooks.push('useEffect');
  if (content.includes('useRef')) preactHooks.push('useRef');
  if (content.includes('useCallback')) preactHooks.push('useCallback');
  if (content.includes('useMemo')) preactHooks.push('useMemo');

  if (preactHooks.length > 0) {
    newImports.push(`import { ${preactHooks.join(', ')} } from 'preact/hooks';`);
  }

  // Add Shopify hooks import if needed
  const shopifyHooks = importedHooks.filter(h =>
    h.startsWith('use') &&
    !['useState', 'useEffect', 'useRef', 'useCallback', 'useMemo'].includes(h)
  );
  if (shopifyHooks.length > 0) {
    newImports.push(`import { ${shopifyHooks.join(', ')} } from '@shopify/ui-extensions/${surface}/preact';`);
  }

  // Insert new imports at the beginning
  out = newImports.join('\n') + '\n\n' + out;

  // Transform reactExtension to async function
  out = out.replace(
    /export\s+default\s+reactExtension\s*\(\s*["'][^"']+["']\s*,\s*\(\s*\)\s*=>\s*(<[^>]+\s*\/>|<[^>]+>[^<]*<\/[^>]+>)\s*\)\s*;?/g,
    `export default async () => {\n  render($1, document.body);\n};`
  );

  // More complex reactExtension patterns
  out = out.replace(
    /export\s+default\s+reactExtension\s*\(\s*["'][^"']+["']\s*,\s*\(\s*\)\s*=>\s*\(/g,
    `export default async () => {\n  render(`
  );

  // Replace closing ); for reactExtension
  out = out.replace(/\)\s*\)\s*;?\s*\n\n(function\s+\w+)/g, `, document.body);\n};\n\n$1`);

  // Transform React components to web components
  for (const [reactComp, webComp] of Object.entries(COMPONENT_MAP)) {
    // Handle self-closing tags: <Component /> → <s-component />
    const selfClosingRegex = new RegExp(`<${reactComp}\\s*([^/>]*)\\s*/>`, 'g');
    out = out.replace(selfClosingRegex, (match, attrs) => {
      const transformedAttrs = transformAttributes(attrs, reactComp);
      return `<${webComp}${transformedAttrs ? ' ' + transformedAttrs : ''} />`;
    });

    // Handle opening tags: <Component> → <s-component>
    const openTagRegex = new RegExp(`<${reactComp}(\\s+[^>]*)?>`, 'g');
    out = out.replace(openTagRegex, (match, attrs) => {
      const transformedAttrs = transformAttributes(attrs || '', reactComp);
      return `<${webComp}${transformedAttrs ? ' ' + transformedAttrs : ''}>`;
    });

    // Handle closing tags: </Component> → </s-component>
    const closeTagRegex = new RegExp(`</${reactComp}>`, 'g');
    out = out.replace(closeTagRegex, `</${webComp}>`);
  }

  // Transform hook usage to shopify.* API
  // useCartLines() → shopify.lines.value
  out = out.replace(/const\s+(\w+)\s*=\s*useCartLines\(\s*\)/g, 'const $1 = shopify.lines.value');
  out = out.replace(/const\s+(\w+)\s*=\s*useSettings\(\s*\)/g, 'const $1 = shopify.settings.value');
  out = out.replace(/const\s+(\w+)\s*=\s*useTranslate\(\s*\)/g, 'const $1 = shopify.i18n.translate');
  out = out.replace(/const\s+(\w+)\s*=\s*useInstructions\(\s*\)/g, 'const $1 = shopify.instructions.value');
  out = out.replace(/const\s+(\w+)\s*=\s*useDeliveryGroups\(\s*\)/g, 'const $1 = shopify.deliveryGroups.value');
  out = out.replace(/const\s+(\w+)\s*=\s*useApplyAttributeChange\(\s*\)/g, '// Using shopify.applyAttributeChange directly');
  out = out.replace(/const\s+(\w+)\s*=\s*useExtensionCapability\(\s*["']([^"']+)["']\s*\)/g, '// Extension capability: shopify.extension.capabilities.$2');

  // Transform useBuyerJourneyIntercept to useEffect pattern
  if (out.includes('useBuyerJourneyIntercept')) {
    out = out.replace(
      /useBuyerJourneyIntercept\s*\(\s*(\([^)]*\)\s*=>\s*\{[\s\S]*?\}\s*)\)\s*;?/g,
      `useEffect(() => {
    let teardown;
    shopify.buyerJourney.intercept($1).then(td => { teardown = td; });
    return () => { if (teardown) teardown(); };
  });`
    );
    warnings.push("useBuyerJourneyIntercept converted to useEffect pattern - review for correctness");
  }

  // Transform applyAttributeChange calls
  out = out.replace(/(\w+)\.applyAttributeChange/g, 'shopify.applyAttributeChange');
  out = out.replace(/await\s+applyAttributeChange/g, 'await shopify.applyAttributeChange');

  // Transform useDeliveryGroup usage
  out = out.replace(/useDeliveryGroup\s*\(\s*(\w+)\?\.\[0\]\s*\)/g, 'useDeliveryGroup(shopify.deliveryGroups.value[0])');

  // Add note about manual review needed
  if (importedHooks.length > 0 || importedComponents.length > 0) {
    warnings.push("Manual review recommended: verify all API calls use global shopify object");
  }

  return { content: out, warnings };
}

function transformAttributes(attrs, componentName) {
  if (!attrs || !attrs.trim()) return '';

  let result = attrs;

  // Transform onChange to onInput for text fields (value is passed via event)
  if (['TextField', 'Checkbox', 'Select'].includes(componentName)) {
    result = result.replace(/onChange\s*=\s*\{([^}]+)\}/g, (match, handler) => {
      // Check if the handler expects a value directly
      if (handler.includes('(value)') || handler.includes('(v)') || handler.includes('async (value)')) {
        return `onInput={${handler.replace(/\(value\)/g, '(e)').replace(/\(v\)/g, '(e)').replace('async (value)', 'async (e)')}}`;
      }
      return `onInput={${handler}}`;
    });
  }

  // Transform onPress to onClick for buttons
  result = result.replace(/onPress\s*=/g, 'onClick=');

  // Transform status to tone for Banner
  if (componentName === 'Banner') {
    result = result.replace(/status\s*=\s*["'](\w+)["']/g, 'tone="$1"');
    result = result.replace(/status\s*=\s*\{["'](\w+)["']\}/g, 'tone="$1"');
  }

  // Transform direction for Stack (BlockStack → direction="block", InlineStack → direction="inline")
  if (componentName === 'BlockStack') {
    if (!result.includes('direction=')) {
      result = result.trim() + ' direction="block"';
    }
  } else if (componentName === 'InlineStack') {
    if (!result.includes('direction=')) {
      result = result.trim() + ' direction="inline"';
    }
  }

  // Transform spacing to gap
  result = result.replace(/spacing\s*=/g, 'gap=');

  // Transform padding="loose" to padding="base"
  result = result.replace(/padding\s*=\s*["']loose["']/g, 'padding="base"');

  // Transform columns for Grid
  if (componentName === 'Grid') {
    result = result.replace(/columns\s*=\s*\{([^}]+)\}/g, 'gridTemplateColumns={`$1`}');
  }

  return result.trim();
}

function generateTsConfig() {
  return JSON.stringify({
    compilerOptions: {
      jsx: "react-jsx",
      jsxImportSource: "preact",
      target: "ES2020",
      checkJs: true,
      allowJs: true,
      moduleResolution: "node",
      esModuleInterop: true
    },
    include: ["./src", "./shopify.d.ts"]
  }, null, 2);
}

// =============================================================================
// Extension Discovery
// =============================================================================

function discoverExtensions(baseDir) {
  const results = [];
  if (!fs.existsSync(baseDir)) return results;

  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const toml = path.join(baseDir, entry.name, "shopify.extension.toml");
    if (!fs.existsSync(toml)) continue;

    const content = readFile(toml);
    const type = extractExtensionType(content);
    const apiVersion = extractApiVersion(content);
    const target = extractTarget(content);

    results.push({
      path: path.join(baseDir, entry.name),
      name: entry.name,
      type,
      apiVersion,
      target,
      tomlContent: content,
    });
  }
  return results;
}

// =============================================================================
// Migration Orchestration
// =============================================================================

async function migrateFunction(ext, targetApiVersion, dryRun, autoApprove, force = false) {
  const oldTarget = ext.target;

  // Check if already using new cart.* target format
  if (oldTarget && oldTarget.startsWith("cart.")) {
    log(`\n  ${ext.name}: Already using new cart.* target format`);
    // Check if just needs API version bump
    if (ext.apiVersion === targetApiVersion && !force) {
      log(`  API version already at ${targetApiVersion} — skipping (use --force to re-migrate)`);
      return { migrated: false, reason: "Already at target version" };
    }
    // Just bump API version
    log(`  Bumping API version from ${ext.apiVersion} to ${targetApiVersion}`);
    const tomlPath = path.join(ext.path, "shopify.extension.toml");
    const newToml = rewriteApiVersion(ext.tomlContent, targetApiVersion);
    const changes = [{
      file: "shopify.extension.toml",
      desc: `api_version bumped to ${targetApiVersion}`,
      apply: () => writeFile(tomlPath, newToml),
    }];

    if (!autoApprove) {
      const proceed = await confirm("  Apply API version bump?");
      if (!proceed) {
        return { migrated: false, reason: "User declined", changes };
      }
    }

    if (!dryRun) {
      changes.forEach(c => c.apply());
      success("Changes applied.");
    } else {
      log("  (dry run — no files written)");
    }
    return { migrated: true, type: "function", apiVersion: targetApiVersion, changes: changes.map(c => ({ file: c.file, desc: c.desc })), warnings: [] };
  }

  const newTarget = FUNCTION_TARGET_MAP[oldTarget];

  if (!newTarget) {
    warn(`No migration mapping for target "${oldTarget}" — skipping`);
    return { migrated: false, reason: "No target mapping available" };
  }

  const changes = [];
  const warnings = [];

  log(`\n${colors.bright}═══ Function: ${ext.name} ═══${colors.reset}`);
  log(`  Current target: ${oldTarget}`);
  log(`  New target: ${newTarget}`);
  log(`  API version: ${ext.apiVersion} → ${targetApiVersion}\n`);

  const oldSnake = "run";
  const newSnake = toSnake(newTarget);

  // Prepare changes
  const srcDir = path.join(ext.path, "src");
  const tomlPath = path.join(ext.path, "shopify.extension.toml");

  // 1. TOML changes
  let newToml = rewriteFunctionToml(ext.tomlContent, oldTarget, newTarget);
  newToml = rewriteApiVersion(newToml, targetApiVersion);
  changes.push({
    file: "shopify.extension.toml",
    desc: `target, input_query, export, api_version updated`,
    apply: () => writeFile(tomlPath, newToml),
  });

  // 2. package.json
  const pkgPath = path.join(ext.path, "package.json");
  if (fs.existsSync(pkgPath)) {
    const { changed, content } = migrateFunctionPackageJson(pkgPath);
    if (changed) {
      changes.push({
        file: "package.json",
        desc: "removed javy dependency",
        apply: () => writeFile(pkgPath, content),
      });
    }
  }

  // 3. GraphQL file
  const oldGql = path.join(srcDir, `${oldSnake}.graphql`);
  const newGql = path.join(srcDir, `${newSnake}.graphql`);
  if (fs.existsSync(oldGql)) {
    const gqlContent = migrateGraphql(readFile(oldGql), newTarget);
    changes.push({
      file: `src/${oldSnake}.graphql → src/${newSnake}.graphql`,
      desc: "query name updated",
      apply: () => { writeFile(newGql, gqlContent); if (oldGql !== newGql) fs.unlinkSync(oldGql); },
    });
  }

  // 4. Main JS file
  const oldJs = path.join(srcDir, `${oldSnake}.js`);
  const newJs = path.join(srcDir, `${newSnake}.js`);
  if (fs.existsSync(oldJs)) {
    const jsContent = migrateFunctionJs(readFile(oldJs), oldTarget, newTarget);
    changes.push({
      file: `src/${oldSnake}.js → src/${newSnake}.js`,
      desc: "function name, types, operations updated",
      apply: () => { writeFile(newJs, jsContent); if (oldJs !== newJs) fs.unlinkSync(oldJs); },
    });
  }

  // 5. Test file
  const oldTest = path.join(srcDir, `${oldSnake}.test.js`);
  const newTest = path.join(srcDir, `${newSnake}.test.js`);
  if (fs.existsSync(oldTest)) {
    const testContent = migrateFunctionTest(readFile(oldTest), oldTarget, newTarget);
    changes.push({
      file: `src/${oldSnake}.test.js → src/${newSnake}.test.js`,
      desc: "import, call, types updated",
      apply: () => { writeFile(newTest, testContent); if (oldTest !== newTest) fs.unlinkSync(oldTest); },
    });
  }

  // 6. Index file
  const indexPath = path.join(srcDir, "index.js");
  if (fs.existsSync(indexPath)) {
    const newIndex = migrateFunctionIndex(readFile(indexPath), newTarget);
    changes.push({
      file: "src/index.js",
      desc: "re-export path updated",
      apply: () => writeFile(indexPath, newIndex),
    });
  }

  // Special warnings
  if (oldTarget === "purchase.shipping-discount.run") {
    warnings.push("Output restructured from flat discounts[] to operations[].deliveryDiscountsAdd - review carefully");
  }

  // Show planned changes
  log("  Planned changes:");
  changes.forEach(c => info(`${c.file}: ${c.desc}`));

  if (warnings.length > 0) {
    log("\n  Warnings:");
    warnings.forEach(w => warn(w));
  }

  // Ask for confirmation
  if (!autoApprove) {
    const proceed = await confirm("\n  Apply these changes?");
    if (!proceed) {
      log("  Skipped.");
      return { migrated: false, reason: "User declined", changes, warnings };
    }
  }

  // Apply changes
  if (!dryRun) {
    changes.forEach(c => c.apply());
    success("Changes applied successfully.");
  } else {
    log("\n  (dry run — no files written)");
  }

  return {
    migrated: true,
    type: "function",
    oldTarget,
    newTarget,
    changes: changes.map(c => ({ file: c.file, desc: c.desc })),
    warnings,
  };
}

async function migrateUIExtension(ext, targetApiVersion, dryRun, autoApprove, force = false) {
  const targetPkgVersion = apiVersionToPackageVersion(targetApiVersion);

  // Check if already at target version
  if (ext.apiVersion === targetApiVersion && !force) {
    log(`\n  ${ext.name}: Already at API version ${targetApiVersion} — skipping (use --force to re-migrate)`);
    return { migrated: false, reason: "Already at target version" };
  }

  log(`\n${colors.bright}═══ UI Extension: ${ext.name} ═══${colors.reset}`);
  log(`  Type: ${ext.type}`);
  log(`  API version: ${ext.apiVersion} → ${targetApiVersion}`);
  log(`  Package version: → ${targetPkgVersion}\n`);

  const changes = [];
  const warnings = [];

  const tomlPath = path.join(ext.path, "shopify.extension.toml");

  // 1. TOML changes
  const newToml = rewriteApiVersion(ext.tomlContent, targetApiVersion);
  changes.push({
    file: "shopify.extension.toml",
    desc: `api_version bumped to ${targetApiVersion}`,
    apply: () => writeFile(tomlPath, newToml),
  });

  // 2. package.json
  const pkgPath = path.join(ext.path, "package.json");
  if (fs.existsSync(pkgPath)) {
    const { changed, content, changes: pkgChanges } = migrateUIPackageJson(pkgPath, targetPkgVersion);
    if (changed) {
      pkgChanges.forEach(c => {
        changes.push({
          file: "package.json",
          desc: c,
          apply: () => writeFile(pkgPath, content),
        });
      });
    }
  }

  // 3. Source files (JSX/TSX) - recursively scan src/ directory
  const srcDir = path.join(ext.path, "src");
  if (fs.existsSync(srcDir)) {
    const sourceFiles = findFilesRecursive(srcDir, (filename) =>
      filename.endsWith('.jsx') ||
      filename.endsWith('.tsx') ||
      (filename.endsWith('.js') && !filename.endsWith('.test.js'))
    );

    for (const filePath of sourceFiles) {
      const content = readFile(filePath);

      // Check if this file uses React patterns
      if (content.includes('@shopify/ui-extensions-react') ||
          content.includes('reactExtension') ||
          content.includes("from 'react'") ||
          content.includes('from "react"')) {

        const surface = ext.type === "ui_extension" && content.includes('customer-account')
          ? "customer-account"
          : "checkout";

        const { content: migratedContent, warnings: fileWarnings } = migrateUISourceFile(content, surface);

        // Get relative path from extension root for display
        const relativePath = path.relative(ext.path, filePath);

        changes.push({
          file: relativePath,
          desc: "React → Preact migration (imports, components, hooks)",
          apply: () => writeFile(filePath, migratedContent),
        });

        warnings.push(...fileWarnings);
      }
    }
  }

  // 4. Create/update tsconfig.json
  const tsconfigPath = path.join(ext.path, "tsconfig.json");
  const newTsConfig = generateTsConfig();
  if (!fs.existsSync(tsconfigPath)) {
    changes.push({
      file: "tsconfig.json",
      desc: "created for Preact JSX support",
      apply: () => writeFile(tsconfigPath, newTsConfig),
    });
  } else {
    const existingConfig = readFile(tsconfigPath);
    if (!existingConfig.includes('jsxImportSource')) {
      changes.push({
        file: "tsconfig.json",
        desc: "updated for Preact JSX support",
        apply: () => writeFile(tsconfigPath, newTsConfig),
      });
    }
  }

  // 5. Remove deprecated files
  const deprecatedFiles = ["shopify.d.ts"];
  deprecatedFiles.forEach(file => {
    const fp = path.join(ext.path, file);
    if (fs.existsSync(fp)) {
      changes.push({
        file,
        desc: "removed (will be regenerated by CLI)",
        apply: () => fs.unlinkSync(fp),
      });
    }
  });

  // 6. Remove package-lock.json and node_modules (clean install needed for new deps)
  const lockFile = path.join(ext.path, "package-lock.json");
  if (fs.existsSync(lockFile)) {
    changes.push({
      file: "package-lock.json",
      desc: "removed (clean install required for new dependencies)",
      apply: () => fs.unlinkSync(lockFile),
    });
  }

  const nodeModulesDir = path.join(ext.path, "node_modules");
  if (fs.existsSync(nodeModulesDir)) {
    changes.push({
      file: "node_modules/",
      desc: "removed (clean install required for new dependencies)",
      apply: () => execSync(`rm -rf "${nodeModulesDir}"`, { stdio: "ignore" }),
    });
  }

  // Show planned changes
  log("  Planned changes:");
  changes.forEach(c => info(`${c.file}: ${c.desc}`));

  if (warnings.length > 0) {
    log("\n  Warnings:");
    warnings.forEach(w => warn(w));
  }

  // Ask for confirmation
  if (!autoApprove) {
    const proceed = await confirm("\n  Apply these changes?");
    if (!proceed) {
      log("  Skipped.");
      return { migrated: false, reason: "User declined", changes, warnings };
    }
  }

  // Apply changes (deduplicate package.json writes)
  if (!dryRun) {
    const appliedFiles = new Set();
    changes.forEach(c => {
      if (!appliedFiles.has(c.file)) {
        c.apply();
        appliedFiles.add(c.file);
      }
    });
    success("Changes applied successfully.");
  } else {
    log("\n  (dry run — no files written)");
  }

  return {
    migrated: true,
    type: "ui_extension",
    apiVersion: targetApiVersion,
    changes: changes.map(c => ({ file: c.file, desc: c.desc })),
    warnings,
  };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const autoApprove = args.includes("--auto-approve");
  const force = args.includes("--force");

  let targetApiVersion = DEFAULT_API_VERSION;
  const avIdx = args.indexOf("--api-version");
  if (avIdx !== -1 && args[avIdx + 1]) {
    targetApiVersion = args[avIdx + 1];
  }

  const paths = args.filter((a, i) =>
    !a.startsWith("--") &&
    !(avIdx !== -1 && i === avIdx + 1)
  );

  // Banner
  log(`\n${colors.cyan}╭─────────────────────────────────────────────────────────╮${colors.reset}`);
  log(`${colors.cyan}│${colors.reset}  ${colors.bright}Shopify Extensions Migration Tool${colors.reset}                       ${colors.cyan}│${colors.reset}`);
  log(`${colors.cyan}│${colors.reset}  Functions & UI Extensions → API ${targetApiVersion}                ${colors.cyan}│${colors.reset}`);
  log(`${colors.cyan}╰─────────────────────────────────────────────────────────╯${colors.reset}`);

  if (dryRun) log(`\n${colors.yellow}  Mode: DRY RUN — no files will be written${colors.reset}\n`);
  if (autoApprove) log(`\n${colors.yellow}  Mode: AUTO-APPROVE — no confirmation prompts${colors.reset}\n`);
  if (force) log(`\n${colors.yellow}  Mode: FORCE — re-migrating even if already at target version${colors.reset}\n`);

  // Discover extensions
  let extensionDirs = [];

  if (paths.length === 0) {
    const scanBase = path.resolve(process.cwd(), "extensions");
    log(`\n  Scanning ${scanBase} for extensions…\n`);
    extensionDirs = discoverExtensions(scanBase);
  } else {
    for (const p of paths) {
      const resolved = path.resolve(process.cwd(), p);
      const toml = path.join(resolved, "shopify.extension.toml");
      if (fs.existsSync(toml)) {
        const content = readFile(toml);
        extensionDirs.push({
          path: resolved,
          name: path.basename(resolved),
          type: extractExtensionType(content),
          apiVersion: extractApiVersion(content),
          target: extractTarget(content),
          tomlContent: content,
        });
      } else if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        extensionDirs.push(...discoverExtensions(resolved));
      } else {
        warn(`Path not found: ${resolved}`);
      }
    }
  }

  if (extensionDirs.length === 0) {
    log("\n  No extensions found. Nothing to do.\n");
    process.exit(0);
  }

  // Categorize extensions
  const functions = extensionDirs.filter(e => e.type === "function");
  const uiExtensions = extensionDirs.filter(e => e.type === "ui_extension");

  log(`  Found ${extensionDirs.length} extension(s):`);
  log(`    • ${functions.length} Function(s)`);
  log(`    • ${uiExtensions.length} UI Extension(s)\n`);

  // Migration log
  const migrationLog = {
    startTime: new Date().toISOString(),
    targetApiVersion,
    dryRun,
    extensions: [],
  };

  // Process functions
  if (functions.length > 0) {
    log(`\n${colors.bright}━━━ Functions ━━━${colors.reset}`);
    for (const ext of functions) {
      const result = await migrateFunction(ext, targetApiVersion, dryRun, autoApprove, force);
      migrationLog.extensions.push({
        name: ext.name,
        path: ext.path,
        ...result,
      });
    }
  }

  // Process UI extensions
  if (uiExtensions.length > 0) {
    log(`\n${colors.bright}━━━ UI Extensions ━━━${colors.reset}`);
    for (const ext of uiExtensions) {
      const result = await migrateUIExtension(ext, targetApiVersion, dryRun, autoApprove, force);
      migrationLog.extensions.push({
        name: ext.name,
        path: ext.path,
        ...result,
      });
    }
  }

  // Clean up top-level package-lock.json and node_modules if any UI extensions were migrated
  const migratedUIExtensions = migrationLog.extensions.filter(e => e.migrated && e.type === "ui_extension");
  if (migratedUIExtensions.length > 0 && !dryRun) {
    const appRoot = process.cwd();
    const topLevelLockFile = path.join(appRoot, "package-lock.json");
    const topLevelNodeModules = path.join(appRoot, "node_modules");

    if (fs.existsSync(topLevelLockFile)) {
      fs.unlinkSync(topLevelLockFile);
      info("Removed top-level package-lock.json");
    }
    if (fs.existsSync(topLevelNodeModules)) {
      execSync(`rm -rf "${topLevelNodeModules}"`, { stdio: "ignore" });
      info("Removed top-level node_modules/");
    }
  } else if (migratedUIExtensions.length > 0 && dryRun) {
    log(`\n  ${colors.yellow}Would remove top-level package-lock.json and node_modules/${colors.reset}`);
    log(`  ${colors.yellow}Would run 'npm install' in top-level and extension directories${colors.reset}`);
  }

  // Run npm install if UI extensions were migrated
  if (migratedUIExtensions.length > 0 && !dryRun) {
    log(`\n${colors.cyan}╭─────────────────────────────────────────────────────────╮${colors.reset}`);
    log(`${colors.cyan}│${colors.reset}  ${colors.bright}Installing Dependencies${colors.reset}                                  ${colors.cyan}│${colors.reset}`);
    log(`${colors.cyan}╰─────────────────────────────────────────────────────────╯${colors.reset}\n`);

    // Top-level npm install (if package.json exists)
    const appRoot = process.cwd();
    const topLevelPkgJson = path.join(appRoot, "package.json");
    if (fs.existsSync(topLevelPkgJson)) {
      process.stdout.write("  Installing top-level dependencies...");
      try {
        execSync("npm install", { cwd: appRoot, stdio: "ignore" });
        log(` ${colors.green}done${colors.reset}`);
      } catch (err) {
        log(` ${colors.red}failed${colors.reset}`);
        warn(`Top-level npm install failed: ${err.message}`);
      }
    }

    // Extension-level npm install
    for (const ext of migratedUIExtensions) {
      const extPkgJson = path.join(ext.path, "package.json");
      if (fs.existsSync(extPkgJson)) {
        process.stdout.write(`  Installing ${ext.name} dependencies...`);
        try {
          execSync("npm install", { cwd: ext.path, stdio: "ignore" });
          log(` ${colors.green}done${colors.reset}`);
        } catch (err) {
          log(` ${colors.red}failed${colors.reset}`);
          warn(`${ext.name} npm install failed: ${err.message}`);
        }
      }
    }
  }

  // Summary
  migrationLog.endTime = new Date().toISOString();
  const migrated = migrationLog.extensions.filter(e => e.migrated);
  const skipped = migrationLog.extensions.filter(e => !e.migrated);

  log(`\n${colors.cyan}╭─────────────────────────────────────────────────────────╮${colors.reset}`);
  log(`${colors.cyan}│${colors.reset}  ${colors.bright}Migration Summary${colors.reset}                                        ${colors.cyan}│${colors.reset}`);
  log(`${colors.cyan}╰─────────────────────────────────────────────────────────╯${colors.reset}`);
  log(`\n  ${colors.green}Migrated: ${migrated.length}${colors.reset}`);
  log(`  ${colors.yellow}Skipped: ${skipped.length}${colors.reset}\n`);

  // Write migration log
  const logPath = path.join(process.cwd(), MIGRATION_LOG_FILE);
  writeFile(logPath, JSON.stringify(migrationLog, null, 2));
  success(`Migration log written to ${MIGRATION_LOG_FILE}`);

  // Post-migration steps
  if (migrated.length > 0) {
    log(`\n${colors.cyan}╭─────────────────────────────────────────────────────────╮${colors.reset}`);
    log(`${colors.cyan}│${colors.reset}  ${colors.bright}Post-migration Steps${colors.reset}                                     ${colors.cyan}│${colors.reset}`);
    log(`${colors.cyan}╰─────────────────────────────────────────────────────────╯${colors.reset}\n`);

    const migratedFunctions = migrated.filter(e => e.type === "function");
    const migratedUI = migrated.filter(e => e.type === "ui_extension");

    if (migratedFunctions.length > 0) {
      log(`  ${colors.bright}For Functions:${colors.reset}`);
      log("  Run typegen to regenerate schema types:\n");
      migratedFunctions.forEach(e => {
        log(`    cd ${path.relative(process.cwd(), e.path)} && shopify app function typegen`);
      });
      log("");
    }

    if (migratedUI.length > 0) {
      log(`  ${colors.bright}For UI Extensions:${colors.reset}`);
      log(`  ${colors.green}✓ Dependencies already installed automatically${colors.reset}\n`);
      log("  1. Run dev to generate shopify.d.ts:");
      log("    shopify app dev");
      log("\n  2. Review migrated source files for:");
      log("    • Component prop changes (onChange → onInput for form fields)");
      log("    • Hook migrations to shopify.* global object");
      log("    • Web component syntax (<s-*> elements)");
      log("");
    }

    log("  3. Build and test each extension:\n");
    log("    shopify app build\n");
  }
}

main().catch(err => {
  error(err.message);
  process.exit(1);
});
