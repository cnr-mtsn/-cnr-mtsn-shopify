const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { isThemeDir, normalizeStore, setupThemeDev } = require("../init-shopify.js");

const THEME_DIRS = ["assets", "config", "layout", "locales", "sections", "snippets", "templates"];

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cnr-init-test-"));
}

function makeThemeDir() {
  const dir = tmpDir();
  for (const d of THEME_DIRS) fs.mkdirSync(path.join(dir, d));
  return dir;
}

test("normalizeStore appends .myshopify.com when missing", () => {
  assert.strictEqual(normalizeStore("acme"), "acme.myshopify.com");
});

test("normalizeStore leaves a full domain untouched", () => {
  assert.strictEqual(normalizeStore("acme.myshopify.com"), "acme.myshopify.com");
});

test("normalizeStore trims whitespace", () => {
  assert.strictEqual(normalizeStore("  acme  "), "acme.myshopify.com");
});

test("isThemeDir is false unless all 7 theme dirs exist", () => {
  const dir = tmpDir();
  assert.strictEqual(isThemeDir(dir), false);
  fs.mkdirSync(path.join(dir, "assets"));
  assert.strictEqual(isThemeDir(dir), false);
  for (const d of THEME_DIRS) fs.mkdirSync(path.join(dir, d), { recursive: true });
  assert.strictEqual(isThemeDir(dir), true);
});

test("setupThemeDev writes dev script, .gitignore, .shopifyignore", () => {
  const dir = makeThemeDir();
  const store = setupThemeDev({ cwd: dir, storeName: "acme" });
  assert.strictEqual(store, "acme.myshopify.com");

  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  assert.match(pkg.scripts.dev, /shopify theme dev --store=acme\.myshopify\.com --host=localhost --port=3000/);

  assert.strictEqual(
    fs.readFileSync(path.join(dir, ".gitignore"), "utf8"),
    "package.json\npackage-lock.json\nnode_modules\n.claude\n.shopifyignore\n"
  );
  assert.strictEqual(
    fs.readFileSync(path.join(dir, ".shopifyignore"), "utf8"),
    "package.json\n.claude\n.gitignore\n"
  );
});

test("setupThemeDev removes pre-existing npm artifacts", () => {
  const dir = makeThemeDir();
  fs.writeFileSync(path.join(dir, "package-lock.json"), "{}");
  fs.mkdirSync(path.join(dir, "node_modules"));
  fs.writeFileSync(path.join(dir, "node_modules", "x.txt"), "x");
  setupThemeDev({ cwd: dir, storeName: "acme" });
  assert.strictEqual(fs.existsSync(path.join(dir, "package-lock.json")), false);
  assert.strictEqual(fs.existsSync(path.join(dir, "node_modules")), false);
});
