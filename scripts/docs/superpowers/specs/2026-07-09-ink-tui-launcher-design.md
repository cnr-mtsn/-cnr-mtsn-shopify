# shopify-tools: Ink TUI launcher for @cnr-mtsn/shopify (v3.0.0)

**Date:** 2026-07-09
**Status:** Approved

## Summary

Replace the four separate readline-based bins in `@cnr-mtsn/shopify` with a
single Ink-powered bin, `shopify-tools`. Run bare, it opens a full-screen
launcher menu to pick a tool; run with a subcommand
(`shopify-tools init | create-node-app | graphql`), it jumps straight into
that tool's screen. All extension-migration tooling is removed — the
shopify-dev MCP now handles migrations better than the script did.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| UI library | Ink (full TUI) — react + ink as runtime deps |
| JSX strategy | esbuild devDependency; `.jsx` source bundled to `dist/cli.js`; `prepublishOnly` build |
| Module system | Package converts to `"type": "module"` (Ink 4+ is ESM-only) |
| Bin layout | Single bin `shopify-tools`; bare = launcher menu, subcommand = direct tool |
| Old bins | All four removed (`shopify-migrate`, `shopify-init`, `shopify-create-node-app`, `shopify-graphql`) |
| Cleanup | Delete all migration tooling (see Deletions) |
| Version | 3.0.0 (breaking: bins removed, ESM) |

## Package structure

```
scripts/                       (package root, unchanged location)
├── package.json               v3.0.0 · "type": "module" · bin: { "shopify-tools": "dist/cli.js" }
│                              deps: ink, react, ink-text-input, ink-select-input
│                              devDeps: esbuild · scripts: build, prepublishOnly, test
├── src/
│   ├── cli.jsx                entry — argv parsing, renders Launcher or a tool,
│   │                          runs handoff descriptors after Ink exits
│   ├── launcher.jsx           menu screen: tool list + descriptions, ↑/↓ navigate,
│   │                          ⏎ run, q/esc quit
│   ├── tools/
│   │   ├── init.jsx           theme dev setup screen
│   │   ├── create-node-app.jsx  scaffold screen
│   │   └── graphql.jsx        Admin GraphQL screen
│   └── lib/
│       ├── init.js            isThemeDir, normalizeStore, setupThemeDev
│       ├── create-node-app.js sanitizeAppName, destRelPath, listFiles, scaffoldNodeApp
│       └── graphql.js         normalizeStoreName, action table, shopify-CLI arg builders
├── templates/node-app/        unchanged
├── test/                      existing node --test suite, converted to ESM imports
│                              from src/lib/
└── dist/cli.js                esbuild bundle of src/ (own code only; ink, react,
                               ink-* remain external runtime deps)
```

`src/lib/` contains the pure logic lifted verbatim (behavior-preserving) from
the current `init-shopify.js`, `create-node-app.js`, and `graphql.js`. No UI
code in `lib/`; no filesystem/spawn logic in the `.jsx` screens beyond calling
`lib/` functions.

### Build

- `npm run build` → `esbuild src/cli.jsx --bundle --format=esm --platform=node --jsx=automatic --packages=external --outfile=dist/cli.js` (plus shebang banner).
- `prepublishOnly` runs the build; `dist/` is gitignored but included in the published package via `files`.

## Child-process handoff

Ink holds the terminal in raw mode, but the tools end by launching processes
that need the terminal to themselves (`npm run dev`, `shopify store auth`
browser flow, `store execute`, GraphiQL). Tool screens therefore never spawn
children directly:

1. A tool screen collects inputs and performs its filesystem work via `lib/`.
2. When a child process is needed, the screen resolves a **handoff
   descriptor** — `{ cmd, args, cwd? }` or an ordered array of them (graphql:
   auth → execute) — and calls `useApp().exit()`.
3. `cli.jsx` awaits `waitUntilExit()`, then runs each descriptor with
   `spawnSync(..., { stdio: "inherit" })`. A non-zero exit stops the sequence
   and becomes the process exit code.
4. If `spawnSync` fails with `ENOENT` on `shopify`, print the existing
   "Shopify CLI not found on PATH" message and exit 1.

## Per-tool flows (behavior preserved)

### Launcher (bare `shopify-tools`)

- Bordered full-screen menu: package name header, three tools with one-line
  descriptions, hint bar (`↑/↓ navigate · ⏎ run · q quit`).
- Selecting a tool swaps the launcher view for that tool's screen in the same
  Ink app (no re-exec).

### init

1. Guard: cwd must contain all 7 theme directories, else red error screen,
   exit 1.
2. Text input: store name (normalized to `*.myshopify.com`).
3. Runs `setupThemeDev` (removes npm artifacts; writes package.json with dev
   script, .gitignore, .shopifyignore).
4. Shows ✓ checklist of written files.
5. Yes/no select: "Start dev server now?" — yes → handoff `npm run dev`;
   no → friendly exit.

### create-node-app

1. Text input: app name, default = sanitized cwd basename.
2. Runs `scaffoldNodeApp` (collision-safe: refuses to overwrite, error screen
   lists collisions, exit 1).
3. Shows file count + next-steps panel (npm install, edit .env, npm run dev).
4. Exits (no handoff).

### graphql

1. Text input: store (normalized via `normalizeStoreName`; empty → error).
2. Text input: scopes (comma-separated, whitespace stripped; empty = reuse
   cached auth).
3. Select: Run ./query.graphql / Run ./mutation.graphql / Open GraphiQL.
4. Validates the chosen `.graphql` file exists in cwd *before* handoff; missing
   → red error screen, exit 1.
5. Handoff sequence: `shopify store auth` (only if scopes given) →
   `shopify store execute --json` (with `--allow-mutations` for mutations) or
   `shopify store graphiql --allow-mutations`.

## Error handling

- Validation failures render as red Ink error screens and exit non-zero.
- Child exit codes propagate as the process exit code.
- Unexpected exceptions: top-level catch prints the message in red, exit 1.

## Testing & verification

- `node --test test/*.test.js` continues to cover the pure `src/lib/`
  functions; tests converted to ESM `import` syntax, assertions unchanged.
- Ink screens verified manually: run each flow end-to-end (launcher
  navigation, init in a real theme dir, create-node-app in an empty dir,
  graphql against a store).

## Deletions

- `migrate-extensions.js`, `upgrade-functions.js`, `upgrade-ui-extensions.js`
- `old-api-version/`, `latest-api-version/` reference directories
- All four old `bin` entries and the `migrate` / `migrate:dry-run` npm scripts
- README rewritten around the three tools + launcher; all migration content
  removed

## Known trade-offs

- **Piped-stdin scriptability dropped.** `graphql.js` currently queues piped
  lines (`printf "store\n..." | shopify-graphql`). Ink requires a real TTY for
  input, so non-interactive use goes away. If needed later, add flags
  (`--store`, `--scopes`, `--action`) — explicitly out of scope now.
- **Runtime deps added.** The package is no longer zero-dependency: ink,
  react, ink-text-input, ink-select-input.
