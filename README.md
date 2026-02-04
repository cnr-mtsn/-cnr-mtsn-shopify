# Shopify Extensions Migration Tool

A unified CLI tool for migrating Shopify extensions to API version 2026-01. Handles both **Shopify Functions** (purchase.* → cart.* targets) and **UI Extensions** (React → Preact with Polaris web components).

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [What Gets Migrated](#what-gets-migrated)
  - [Functions](#functions)
  - [UI Extensions](#ui-extensions)
- [Migration Log](#migration-log)
- [Post-Migration Steps](#post-migration-steps)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Reference Directories](#reference-directories)

---

## Overview

As of API version 2025-10/2026-01, Shopify has made significant changes to both Functions and UI Extensions:

| Extension Type | Key Changes |
|---------------|-------------|
| **Functions** | Target paths changed from `purchase.*` to `cart.*`, operation keys renamed, output structures changed |
| **UI Extensions** | React deprecated in favor of Preact, React components replaced with Polaris web components (`<s-*>` elements), hooks replaced with global `shopify` object |

This tool automates these migrations interactively, allowing you to review and approve changes for each extension before they're applied.

---

## Installation

### Local Usage (Recommended)

```bash
# Clone or navigate to the tools directory
cd /path/to/tools/extensions-migration

# No dependencies required - uses Node.js built-ins only
node migrate-extensions.js --help
```

### Global Installation

```bash
# From the extensions-migration directory
npm link

# Now available globally
migrate-extensions --help
```

### Requirements

- **Node.js** 18.x or higher
- A Shopify app with extensions in an `extensions/` directory

---

## Quick Start

```bash
# Navigate to your Shopify app root (where extensions/ folder is located)
cd /path/to/your-shopify-app

# Run the migration tool (interactive mode)
node /path/to/migrate-extensions.js

# Or if installed globally
migrate-extensions
```

The tool will:
1. Scan for all extensions in `./extensions/`
2. Show what changes will be made for each extension
3. Ask for your approval before applying changes
4. Generate a `migration.json` log file

---

## Usage

```bash
node migrate-extensions.js [path] [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `[path]` | Path to extensions directory or specific extension. Defaults to `./extensions/` |

### Options

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview changes without writing any files |
| `--auto-approve` | Skip confirmation prompts (use with caution) |
| `--api-version <version>` | Target API version (default: `2026-01`) |
| `--force` | Re-migrate source files even if already at target API version |

### Examples

```bash
# Interactive migration of all extensions
node migrate-extensions.js

# Preview changes only (no files modified)
node migrate-extensions.js --dry-run

# Migrate specific extension
node migrate-extensions.js extensions/my-checkout-extension

# Migrate without prompts (for CI/CD)
node migrate-extensions.js --auto-approve

# Combine options
node migrate-extensions.js ./extensions --dry-run --auto-approve

# Target a different API version
node migrate-extensions.js --api-version 2025-10

# Re-migrate source files even if TOML shows target version
# Useful if initial migration missed some files
node migrate-extensions.js --force
```

---

## What Gets Migrated

### Functions

#### Target Path Transformations

| Old Target | New Target |
|------------|------------|
| `purchase.payment-customization.run` | `cart.payment-methods.transform.run` |
| `purchase.shipping-discount.run` | `cart.delivery-options.discounts.generate.run` |
| `purchase.product-discount.run` | `cart.lines.discounts.generate.run` |
| `purchase.order-discount.run` | `cart.lines.discounts.generate.run` |
| `purchase.cart-transform.run` | `cart.transform.run` |
| `purchase.delivery-customization.run` | `cart.delivery-options.transform.run` |
| `purchase.delivery-customization.fetch` | `cart.delivery-options.transform.fetch` |
| `purchase.fulfillment-constraint-rule.run` | `cart.fulfillment-constraints.generate.run` |
| `purchase.order-routing-location-rule.run` | `cart.fulfillment-groups.location-rankings.generate.run` |
| `purchase.validation.run` | `cart.validations.generate.run` |
| `purchase.validation.fetch` | `cart.validations.generate.fetch` |

#### File Changes

| File | Changes |
|------|---------|
| `shopify.extension.toml` | `target`, `input_query`, `export`, `api_version` updated |
| `package.json` | `javy` dependency removed |
| `src/run.graphql` | Renamed to `src/{snake_case_target}.graphql`, query name updated |
| `src/run.js` | Renamed to `src/{snake_case_target}.js`, function name and types updated |
| `src/run.test.js` | Renamed, imports and function calls updated |
| `src/index.js` | Re-export path updated |

#### Operation Key Renames

**Payment Customization:**
```javascript
// Before                    // After
{ hide: {...} }        →     { paymentMethodHide: {...} }
{ move: {...} }        →     { paymentMethodMove: {...} }
{ rename: {...} }      →     { paymentMethodRename: {...} }
```

**Delivery Customization:**
```javascript
// Before                    // After
{ hide: {...} }        →     { deliveryOptionHide: {...} }
{ move: {...} }        →     { deliveryOptionMove: {...} }
{ rename: {...} }      →     { deliveryOptionRename: {...} }
```

**Cart Transform:**
```javascript
// Before                    // After
{ expand: {...} }      →     { lineExpand: {...} }
{ merge: {...} }       →     { linesMerge: {...} }
{ update: {...} }      →     { lineUpdate: {...} }
```

#### Shipping Discount Output Restructuring

```javascript
// Before (flat structure)
return {
  discounts: [{
    value: { percentage: { value: 10 } },
    targets: [{ deliveryOption: { handle: "..." } }],
    message: "10% off shipping"
  }]
};

// After (nested structure)
return {
  operations: [{
    deliveryDiscountsAdd: {
      selectionStrategy: "ALL",
      candidates: [{
        targets: [{ deliveryOption: { handle: "..." } }],
        value: { percentage: { value: 10 } },
        message: "10% off shipping",
        associatedDiscountCode: null
      }]
    }
  }]
};
```

---

### UI Extensions

#### Package.json Changes

```json
// Before (React)
{
  "dependencies": {
    "react": "^18.0.0",
    "@shopify/ui-extensions": "2024.4.x",
    "@shopify/ui-extensions-react": "2024.4.x"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "react-reconciler": "0.29.0"
  }
}

// After (Preact)
{
  "dependencies": {
    "preact": "^10.10.0",
    "@preact/signals": "^2.3.0",
    "@shopify/ui-extensions": "2026.01.x"
  }
}
```

> **Note:** The migration tool removes `node_modules/` and `package-lock.json` from both the top-level app directory and each extension directory to ensure a clean dependency installation with the new Preact packages. Run `npm install` at both levels after migration.

#### Extension Registration

```jsx
// Before (React)
import { reactExtension, TextField } from '@shopify/ui-extensions-react/checkout';

export default reactExtension(
  'purchase.checkout.block.render',
  () => <Extension />
);

// After (Preact)
import '@shopify/ui-extensions/preact';
import { render } from 'preact';

export default async () => {
  render(<Extension />, document.body);
};
```

#### Component Transformations

| React Component | Polaris Web Component |
|-----------------|----------------------|
| `<TextField />` | `<s-text-field />` |
| `<Checkbox />` | `<s-checkbox />` |
| `<Button />` | `<s-button />` |
| `<Banner />` | `<s-banner />` |
| `<Text />` | `<s-text />` |
| `<Heading />` | `<s-heading />` |
| `<BlockStack />` | `<s-stack direction="block" />` |
| `<InlineStack />` | `<s-stack direction="inline" />` |
| `<View />` | `<s-box />` |
| `<Select />` | `<s-select />` |
| `<Image />` | `<s-image />` |
| `<Link />` | `<s-link />` |
| `<Spinner />` | `<s-spinner />` |
| `<Divider />` | `<s-divider />` |
| `<Grid />` | `<s-grid />` |
| `<Modal />` | `<s-modal />` |

[Full component mapping in Shopify docs](https://shopify.dev/docs/api/checkout-ui-extensions/latest/upgrading-to-2026-01)

#### Hook to API Transformations

```jsx
// Before (React hooks)
const lines = useCartLines();
const settings = useSettings();
const translate = useTranslate();
const applyChange = useApplyAttributeChange();

// After (shopify global object)
const lines = shopify.lines.value;
const settings = shopify.settings.value;
const translate = shopify.i18n.translate;
await shopify.applyAttributeChange({...});
```

#### Event Handler Changes

```jsx
// Before (React - value passed directly)
<TextField
  onChange={(value) => setValue(value)}
/>

// After (Preact - event object)
<s-text-field
  onInput={(e) => setValue(e.target.value)}
/>
```

---

## Migration Log

After each run, the tool generates a `migration.json` file in the current directory:

```json
{
  "startTime": "2026-02-04T20:16:24.335Z",
  "targetApiVersion": "2026-01",
  "dryRun": false,
  "extensions": [
    {
      "name": "my-checkout-extension",
      "path": "/path/to/extensions/my-checkout-extension",
      "migrated": true,
      "type": "ui_extension",
      "apiVersion": "2026-01",
      "changes": [
        { "file": "shopify.extension.toml", "desc": "api_version bumped to 2026-01" },
        { "file": "package.json", "desc": "removed react from dependencies" },
        { "file": "src/Checkout.jsx", "desc": "React → Preact migration" }
      ],
      "warnings": [
        "Manual review recommended: verify all API calls use global shopify object"
      ]
    }
  ],
  "endTime": "2026-02-04T20:16:24.348Z"
}
```

---

## Post-Migration Steps

After running the migration tool, complete these steps:

### For Functions

```bash
# Regenerate schema types for each function
cd extensions/my-function
shopify app function typegen
```

### For UI Extensions

> **⚠️ IMPORTANT:** The migration tool removes `node_modules/` and `package-lock.json` from both the **top-level app directory** and **each extension directory** to ensure a clean install with the new Preact dependencies. You **MUST** run `npm install` before any other Shopify commands!

```bash
# 1. Install updated dependencies (REQUIRED FIRST STEP!)
# Top-level app dependencies:
npm install

# Extension dependencies:
cd extensions/my-ui-extension
npm install

# 2. Run dev to generate shopify.d.ts type definitions
shopify app dev

# 3. Build and verify
shopify app build
```

### Manual Review Checklist

- [ ] Verify all `onChange` handlers are converted to `onInput` with event object
- [ ] Check that `shopify.*` API calls work correctly (not `useApi()` hooks)
- [ ] Review component prop changes (e.g., `status` → `tone` for Banner)
- [ ] Test `useBuyerJourneyIntercept` conversions (now uses `useEffect` pattern)
- [ ] Run tests: `npm test`
- [ ] Test in development: `shopify app dev`

---

## Examples

### Example 1: Migrating a Single Extension

```bash
$ node migrate-extensions.js extensions/freight-account --dry-run

╭─────────────────────────────────────────────────────────╮
│  Shopify Extensions Migration Tool                       │
│  Functions & UI Extensions → API 2026-01                │
╰─────────────────────────────────────────────────────────╯

  Mode: DRY RUN — no files will be written

═══ UI Extension: freight-account ═══
  Type: ui_extension
  API version: 2025-01 → 2026-01
  Package version: → 2026.01.x

  Planned changes:
  →  shopify.extension.toml: api_version bumped to 2026-01
  →  package.json: removed react from dependencies
  →  package.json: added preact ^10.10.0
  →  src/Checkout.jsx: React → Preact migration

  Apply these changes? [y/n]:
```

### Example 2: CI/CD Pipeline

```yaml
# .github/workflows/migrate.yml
name: Migrate Extensions
on:
  workflow_dispatch:

jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Run Migration
        run: node tools/migrate-extensions.js --auto-approve

      - name: Commit Changes
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add -A
          git commit -m "chore: migrate extensions to 2026-01 API"
          git push
```

---

## Troubleshooting

### "No extensions found"

Make sure you're running the tool from your app's root directory (where `extensions/` folder exists), or provide the correct path:

```bash
node migrate-extensions.js /path/to/your/app/extensions
```

### "No migration mapping for target"

The extension is either:
1. Already using the new `cart.*` target format (no migration needed)
2. Using a target not yet supported by this tool

### TypeScript errors after migration

Run `shopify app dev` to regenerate the `shopify.d.ts` type definitions file.

### Component not rendering

Polaris web components require closing tags even when empty:

```jsx
// Wrong
<s-text-field label="Name" />

// Correct
<s-text-field label="Name"></s-text-field>
```

### Event handlers not working

Remember that Preact event handlers receive the event object, not the value directly:

```jsx
// Before (React)
onChange={(value) => setValue(value)}

// After (Preact)
onInput={(e) => setValue(e.target.value)}
```

---

## Reference Directories

This repository includes reference implementations:

| Directory | Description |
|-----------|-------------|
| `old-api-version/` | Extensions using pre-2025-10 patterns (React, purchase.* targets) |
| `latest-api-version/` | Manually migrated extensions using 2026-01 patterns (Preact, cart.* targets) |

Use these as reference when reviewing your migrated code.

---

## Deprecated Scripts

The following scripts are deprecated but still available for backwards compatibility:

- `upgrade-functions.js` - Use `migrate-extensions.js` instead
- `upgrade-ui-extensions.js` - Use `migrate-extensions.js` instead

---

## Contributing

1. Test changes against both `old-api-version/` and `latest-api-version/` directories
2. Run with `--dry-run` first to verify output
3. Update this README if adding new features

---

## Resources

- [Shopify Checkout UI Extensions - Upgrading to 2026-01](https://shopify.dev/docs/api/checkout-ui-extensions/latest/upgrading-to-2026-01)
- [Shopify Customer Account Extensions - Upgrading to 2026-01](https://shopify.dev/docs/api/customer-account-ui-extensions/latest/upgrading-to-2026-01)
- [Polaris Web Components Reference](https://shopify.dev/docs/api/checkout-ui-extensions/latest/polaris-web-components)
- [Shopify Functions Documentation](https://shopify.dev/docs/api/functions)
