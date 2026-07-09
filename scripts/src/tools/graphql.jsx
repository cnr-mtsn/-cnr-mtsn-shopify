// src/tools/graphql.jsx — Admin GraphQL screen. Store → scopes → action →
// validate file → handoff to shopify store auth/execute/graphiql.
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import fs from "node:fs";
import path from "node:path";
import { normalizeStoreName, ACTIONS, buildHandoff } from "../lib/graphql.js";

export function GraphqlTool({ onFinish }) {
  const [step, setStep] = useState("store"); // store | scopes | action
  const [storeInput, setStoreInput] = useState("");
  const [scopesInput, setScopesInput] = useState("");
  const [storeName, setStoreName] = useState("");
  const [scopes, setScopes] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (error) onFinish({ exitCode: 1 });
  }, [error]);

  const submitStore = (value) => {
    const name = normalizeStoreName(value);
    if (!name) {
      setError("A store name is required.");
      return;
    }
    setStoreName(name);
    setStep("scopes");
  };

  const submitScopes = (value) => {
    setScopes(value.trim().replace(/\s+/g, ""));
    setStep("action");
  };

  const submitAction = (item) => {
    const action = ACTIONS.find((a) => a.value === item.value);
    if (action.file && !fs.existsSync(path.join(process.cwd(), action.file))) {
      setError(`No ${action.file} found in ${process.cwd()}`);
      return;
    }
    onFinish({ handoff: buildHandoff({ shop: `${storeName}.myshopify.com`, scopes, action }) });
  };

  if (error) {
    return (
      <Box paddingX={1}>
        <Text color="red" bold>Error: {error}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>
        <Text bold>Shopify Admin GraphQL</Text> <Text dimColor>(store auth + execute wrapper)</Text>
      </Text>
      <Text dimColor>─────────────────────────────────────</Text>

      {storeName ? (
        <Text dimColor>Store: {storeName}</Text>
      ) : (
        <Box>
          <Text>
            Store <Text dimColor>(name, without .myshopify.com)</Text>:{" "}
          </Text>
          <TextInput value={storeInput} onChange={setStoreInput} onSubmit={submitStore} />
        </Box>
      )}

      {step === "scopes" && (
        <Box>
          <Text>
            Scopes <Text dimColor>(comma-separated; empty reuses existing auth)</Text>:{" "}
          </Text>
          <TextInput value={scopesInput} onChange={setScopesInput} onSubmit={submitScopes} />
        </Box>
      )}

      {step === "action" && (
        <Box flexDirection="column">
          <Text dimColor>Scopes: {scopes || "(reuse existing auth)"}</Text>
          <Box height={1} />
          <SelectInput
            items={ACTIONS.map(({ label, value }) => ({ label, value }))}
            onSelect={submitAction}
          />
        </Box>
      )}
    </Box>
  );
}
