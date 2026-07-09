// src/lib/graphql.js — pure logic for the Admin GraphQL tool (no UI, no spawning).
// Builds handoff descriptors consumed by src/lib/run.js after Ink exits.

/** Reduce "acme-parts", "acme-parts.myshopify.com", or a full admin URL to the bare store name. */
export function normalizeStoreName(input) {
  return String(input || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\.myshopify\.com.*$/, "")
    .replace(/\/.*$/, "");
}

export const ACTIONS = [
  { label: "Run ./query.graphql", value: "query", file: "query.graphql" },
  { label: "Run ./mutation.graphql", value: "mutation", file: "mutation.graphql", mutations: true },
  { label: "Open GraphiQL", value: "graphiql", graphiql: true },
];

/**
 * Build the ordered shopify-CLI handoff steps: optional auth (only when scopes
 * were given), then execute or graphiql.
 */
export function buildHandoff({ shop, scopes, action }) {
  const steps = [];
  if (scopes) {
    steps.push({
      cmd: "shopify",
      args: ["store", "auth", "--store", shop, "--scopes", scopes],
      note: `Authenticating against ${shop}...`,
    });
  }
  if (action.graphiql) {
    steps.push({
      cmd: "shopify",
      args: ["store", "graphiql", "--store", shop, "--allow-mutations"],
      note: `Opening GraphiQL for ${shop}...`,
    });
  } else {
    const args = ["store", "execute", "--store", shop, "--query-file", action.file, "--json"];
    if (action.mutations) args.push("--allow-mutations");
    steps.push({ cmd: "shopify", args, note: `Running ${action.file} against ${shop}...` });
  }
  return steps;
}
