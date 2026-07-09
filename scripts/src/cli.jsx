// src/cli.jsx — shopify-tools entry. Bare → launcher; subcommand → tool screen.
// Handoff children (npm run dev, shopify store ...) run AFTER Ink exits so
// they get the terminal to themselves.
import { render } from "ink";
import { App } from "./app.jsx";
import { runHandoff } from "./lib/run.js";

const COMMANDS = ["init", "create-node-app", "graphql"];
const arg = process.argv[2];

const USAGE = `Usage: shopify-tools [command]

Commands:
  init             Set up a Shopify theme for local development
  create-node-app  Scaffold a Shopify Node/Express app
  graphql          Run Admin GraphQL queries via the Shopify CLI

Run with no command to open the interactive launcher.`;

if (arg === "--help" || arg === "-h") {
  console.log(USAGE);
  process.exit(0);
}
if (arg && !COMMANDS.includes(arg)) {
  console.error(`Unknown command "${arg}"\n\n${USAGE}`);
  process.exit(1);
}

let outcome = {};
const { waitUntilExit } = render(<App initialTool={arg ?? null} onDone={(result) => { outcome = result; }} />);
await waitUntilExit();

let exitCode = outcome.exitCode ?? 0;
if (exitCode === 0 && outcome.handoff) exitCode = runHandoff(outcome.handoff);
process.exit(exitCode);
