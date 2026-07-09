// src/tools/create-node-app.jsx — scaffold screen. Name input → scaffold →
// success panel with next steps (or collision error). No handoff.
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import path from "node:path";
import { sanitizeAppName, scaffoldNodeApp } from "../lib/create-node-app.js";

export function CreateNodeAppTool({ onFinish }) {
  const cwd = process.cwd();
  const defaultName = sanitizeAppName(path.basename(cwd));
  const [nameInput, setNameInput] = useState("");
  const [result, setResult] = useState(null); // { written: string[] } | { error: string }

  // Exit after the result frame paints.
  useEffect(() => {
    if (result) onFinish({ exitCode: result.error ? 1 : 0 });
  }, [result]);

  const handleSubmit = (value) => {
    const appName = value.trim() ? sanitizeAppName(value) : defaultName;
    try {
      setResult({ written: scaffoldNodeApp({ cwd, appName }) });
    } catch (err) {
      setResult({ error: err.message });
    }
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Create Shopify Node App</Text>
      <Text dimColor>─────────────────────────────────────</Text>
      {result === null ? (
        <Box>
          <Text>App name: </Text>
          <TextInput
            value={nameInput}
            onChange={setNameInput}
            onSubmit={handleSubmit}
            placeholder={defaultName}
          />
        </Box>
      ) : result.error ? (
        <Text color="red" bold>Error: {result.error}</Text>
      ) : (
        <Box flexDirection="column">
          <Text>
            <Text color="green">✓</Text> Scaffolded {result.written.length} files into <Text dimColor>{cwd}</Text>
          </Text>
          <Box height={1} />
          <Text bold>Next steps:</Text>
          <Text>  <Text dimColor>1.</Text> npm install</Text>
          <Text>  <Text dimColor>2.</Text> Edit .env with your Shopify credentials</Text>
          <Text>  <Text dimColor>3.</Text> npm run dev <Text dimColor>→ GET /health</Text></Text>
        </Box>
      )}
    </Box>
  );
}
