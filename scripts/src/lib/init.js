// src/lib/init.js — pure theme-dev-setup logic (no UI).
import fs from "node:fs";
import path from "node:path";

export const THEME_DIRS = ["assets", "config", "layout", "locales", "sections", "snippets", "templates"];

/** True only when `cwd` contains all 7 Shopify theme directories. */
export function isThemeDir(cwd) {
  return THEME_DIRS.every((dir) => {
    try {
      return fs.statSync(path.join(cwd, dir)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Append `.myshopify.com` if the store wasn't given as a full domain. */
export function normalizeStore(input) {
  const store = String(input).trim();
  return store.endsWith(".myshopify.com") ? store : `${store}.myshopify.com`;
}

/**
 * Write the theme dev files into `cwd`. Pure filesystem work — no prompts.
 * @returns {string} the resolved store domain
 */
export function setupThemeDev({ cwd, storeName }) {
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
