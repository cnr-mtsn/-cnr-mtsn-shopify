import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sanitizeAppName, destRelPath, scaffoldNodeApp } from "../src/lib/create-node-app.js";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cnr-scaffold-test-"));
}

test("sanitizeAppName lowercases and dashes non-name chars", () => {
  assert.strictEqual(sanitizeAppName("My App"), "my-app");
  assert.strictEqual(sanitizeAppName("Acme/Co!"), "acme-co");
});

test("sanitizeAppName falls back when empty", () => {
  assert.strictEqual(sanitizeAppName("   "), "shopify-app");
});

test("destRelPath renames stored dotfiles only", () => {
  assert.strictEqual(destRelPath("gitignore"), ".gitignore");
  assert.strictEqual(destRelPath("env"), ".env");
  assert.strictEqual(destRelPath("env.example"), ".env.example");
  assert.strictEqual(destRelPath(path.join("src", "index.js")), path.join("src", "index.js"));
});

test("scaffoldNodeApp writes the tree, renames dotfiles, substitutes name", () => {
  const dir = tmpDir();
  const written = scaffoldNodeApp({ cwd: dir, appName: "My App" });

  // dotfiles renamed
  assert.ok(fs.existsSync(path.join(dir, ".gitignore")));
  assert.ok(fs.existsSync(path.join(dir, ".env")));
  assert.ok(fs.existsSync(path.join(dir, ".env.example")));
  assert.ok(!fs.existsSync(path.join(dir, "gitignore")));
  assert.ok(!fs.existsSync(path.join(dir, "env")));

  // key tree
  for (const rel of [
    "src/index.js",
    "src/config/shopify.js",
    "src/middleware/auth.js",
    "src/middleware/verifyShopifyWebhook.js",
    "src/routes/health.js",
    "src/routes/webhooks.js",
    "src/services/.gitkeep",
    "src/utils/logger.js",
    "src/utils/shopify.js",
    "scripts/.gitkeep",
    "package.json",
    "README.md",
  ]) {
    assert.ok(fs.existsSync(path.join(dir, rel)), `missing ${rel}`);
  }

  // token substitution
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  assert.strictEqual(pkg.name, "my-app");
  assert.strictEqual(pkg.type, "module");
  assert.strictEqual(pkg.dependencies.cors, "^2.8.5");
  const index = fs.readFileSync(path.join(dir, "src", "index.js"), "utf8");
  assert.ok(index.includes("my-app"));
  assert.ok(!index.includes("{{APP_NAME}}"));

  // the scopes fix is present
  const cfg = fs.readFileSync(path.join(dir, "src", "config", "shopify.js"), "utf8");
  assert.match(cfg, /SHOPIFY_ACCESS_SCOPES \|\| ''/);

  // return value lists destination-relative paths
  assert.ok(written.includes(".gitignore"));
  assert.ok(written.includes(path.join("src", "index.js")));
});

test("scaffoldNodeApp refuses to overwrite existing files", () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, "package.json"), "{}");
  assert.throws(
    () => scaffoldNodeApp({ cwd: dir, appName: "x" }),
    /Refusing to overwrite/
  );
  // the pre-existing file is untouched
  assert.strictEqual(fs.readFileSync(path.join(dir, "package.json"), "utf8"), "{}");
});
