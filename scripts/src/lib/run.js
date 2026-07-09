// src/lib/run.js — runs handoff descriptors after the Ink app has exited and
// released the terminal. stdio is inherited so children (npm run dev, shopify
// store auth/execute/graphiql) own the terminal.
import { spawnSync } from "node:child_process";

const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

/** @returns {number} exit code — 0 on success, first failing status otherwise */
export function runHandoff(steps) {
  for (const step of steps) {
    if (step.note) console.log(`\n${DIM}${step.note}${RESET}`);
    const result = spawnSync(step.cmd, step.args, { stdio: "inherit", cwd: step.cwd });
    if (result.error && result.error.code === "ENOENT") {
      const msg =
        step.cmd === "shopify"
          ? "Shopify CLI not found on PATH. Install it: npm i -g @shopify/cli"
          : `${step.cmd} not found on PATH.`;
      console.error(`${RED}${msg}${RESET}`);
      return 1;
    }
    const status = result.status ?? 1;
    if (status !== 0) return status;
  }
  return 0;
}
