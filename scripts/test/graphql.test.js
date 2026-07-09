import test from "node:test";
import assert from "node:assert";
import { normalizeStoreName, ACTIONS, buildHandoff } from "../src/lib/graphql.js";

test("normalizeStoreName reduces any input form to the bare store name", () => {
  assert.strictEqual(normalizeStoreName("acme-parts"), "acme-parts");
  assert.strictEqual(normalizeStoreName("acme-parts.myshopify.com"), "acme-parts");
  assert.strictEqual(normalizeStoreName("https://acme-parts.myshopify.com/admin"), "acme-parts");
  assert.strictEqual(normalizeStoreName("  acme/anything "), "acme");
  assert.strictEqual(normalizeStoreName(""), "");
  assert.strictEqual(normalizeStoreName(undefined), "");
});

test("ACTIONS defines query, mutation, and graphiql entries", () => {
  assert.deepStrictEqual(ACTIONS.map((a) => a.value), ["query", "mutation", "graphiql"]);
  assert.strictEqual(ACTIONS[0].file, "query.graphql");
  assert.strictEqual(ACTIONS[1].file, "mutation.graphql");
  assert.strictEqual(ACTIONS[1].mutations, true);
  assert.strictEqual(ACTIONS[2].graphiql, true);
});

test("buildHandoff without scopes runs execute only", () => {
  const steps = buildHandoff({ shop: "acme.myshopify.com", scopes: "", action: ACTIONS[0] });
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].cmd, "shopify");
  assert.deepStrictEqual(steps[0].args, [
    "store", "execute", "--store", "acme.myshopify.com", "--query-file", "query.graphql", "--json",
  ]);
});

test("buildHandoff with scopes prepends an auth step", () => {
  const steps = buildHandoff({ shop: "acme.myshopify.com", scopes: "read_products", action: ACTIONS[0] });
  assert.strictEqual(steps.length, 2);
  assert.deepStrictEqual(steps[0].args, [
    "store", "auth", "--store", "acme.myshopify.com", "--scopes", "read_products",
  ]);
});

test("buildHandoff adds --allow-mutations for mutations", () => {
  const steps = buildHandoff({ shop: "acme.myshopify.com", scopes: "", action: ACTIONS[1] });
  assert.ok(steps[0].args.includes("--allow-mutations"));
  assert.ok(steps[0].args.includes("mutation.graphql"));
});

test("buildHandoff graphiql action opens graphiql with mutations allowed", () => {
  const steps = buildHandoff({ shop: "acme.myshopify.com", scopes: "", action: ACTIONS[2] });
  assert.deepStrictEqual(steps[0].args, [
    "store", "graphiql", "--store", "acme.myshopify.com", "--allow-mutations",
  ]);
});
