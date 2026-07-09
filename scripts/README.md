# @cnr-mtsn/shopify

Shopify developer CLI suite with an interactive [Ink](https://github.com/vadimdemedes/ink) launcher.
One bin, three tools: theme dev setup, Node/Express app scaffolding, and ad-hoc
Admin GraphQL queries.

## Install

```bash
npm i -g @cnr-mtsn/shopify
# or run without installing
npx @cnr-mtsn/shopify
```

Requires Node 22+. The `graphql` tool additionally requires the Shopify CLI
(`npm i -g @shopify/cli`).

## Usage

```bash
shopify-tools                  # open the interactive launcher
shopify-tools init             # jump straight to a tool
shopify-tools create-node-app
shopify-tools graphql
shopify-tools --help
```

Running bare opens a menu — ↑/↓ to navigate, ⏎ to run, q to quit:

```
╭──────────────────────────────────────────────────╮
│  @cnr-mtsn/shopify                               │
│                                                  │
│  ❯ init              Theme dev setup             │
│    create-node-app   Node/Express app scaffold   │
│    graphql           Admin GraphQL runner        │
│                                                  │
│  ↑/↓ navigate · ⏎ run · q quit                   │
╰──────────────────────────────────────────────────╯
```

## Tools

### init — theme dev setup

Run from the root of a Shopify theme (all 7 standard directories must exist).
Prompts for a store, then writes a `package.json` with a `dev` script
(`shopify theme dev --store=<store> --host=localhost --port=3000`), a
`.gitignore`, and a `.shopifyignore`, and offers to start the dev server.

```bash
cd my-theme
shopify-tools init
```

### create-node-app — Node/Express scaffold

Scaffolds a Shopify Node/Express app into the current directory — Admin
GraphQL client (Client Credentials Grant), pino logging, webhook HMAC
verification, Bearer auth, and a working `/health` route. Refuses to
overwrite existing files.

```bash
mkdir my-app && cd my-app
shopify-tools create-node-app
npm install
npm run dev   # GET /health
```

### graphql — Admin GraphQL runner

Run ad-hoc Admin GraphQL against any store you can log into, using the
Shopify CLI's user-scoped auth (`shopify store auth` / `store execute`) — no
app, client id, or access token needed. Prompts for the store and scopes
(leave scopes empty to reuse a cached auth), then runs `./query.graphql` or
`./mutation.graphql` from the current directory, or opens GraphiQL.

```bash
cd any-project        # with a query.graphql / mutation.graphql if running files
shopify-tools graphql
```

The browser auth screen opens on first use per store; the token is cached by
the Shopify CLI and acts as *you*, limited by your staff/collaborator
permissions.

## Development

```bash
npm install
npm test          # node --test over src/lib
npm run build     # esbuild → dist/cli.js
node dist/cli.js  # run the built CLI
```

Pure logic lives in `src/lib/` (tested); Ink screens live in `src/` and
`src/tools/`. `prepublishOnly` rebuilds `dist/` automatically.
