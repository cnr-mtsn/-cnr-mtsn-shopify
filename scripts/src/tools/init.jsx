// src/tools/init.jsx — theme dev setup screen. Guard → store input → checklist
// → optional handoff to `npm run dev`.
import { useEffect, useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import SelectInput from "ink-select-input";
import { isThemeDir, setupThemeDev } from "../lib/init.js";

export function InitTool({ onFinish }) {
  const cwd = process.cwd();
  const [themeOk] = useState(() => isThemeDir(cwd));
  const [storeInput, setStoreInput] = useState("");
  const [store, setStore] = useState(null); // resolved domain once setup has run

  // Guard failure: paint the error frame, then exit 1 (effects run post-render).
  useEffect(() => {
    if (!themeOk) onFinish({ exitCode: 1 });
  }, [themeOk]);

  if (!themeOk) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color="red" bold>Error: Not a Shopify theme folder.</Text>
        <Text dimColor>Run this from the root of your Shopify theme.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>Shopify Dev Setup</Text>
      <Text dimColor>─────────────────────────────────────</Text>
      {store === null ? (
        <Box>
          <Text>
            Store <Text dimColor>(name or full .myshopify.com URL)</Text>:{" "}
          </Text>
          <TextInput
            value={storeInput}
            onChange={setStoreInput}
            onSubmit={(value) => setStore(setupThemeDev({ cwd, storeName: value }))}
          />
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text><Text color="green">✓</Text> Initialized package.json</Text>
          <Text><Text color="green">✓</Text> Added dev script <Text dimColor>→ {store}</Text></Text>
          <Text><Text color="green">✓</Text> Created .gitignore</Text>
          <Text><Text color="green">✓</Text> Created .shopifyignore</Text>
          <Box height={1} />
          <Text><Text bold color="green">Ready!</Text> <Text dimColor>Start dev server now?</Text></Text>
          <SelectInput
            items={[
              { label: "Yes — npm run dev", value: "yes" },
              { label: "No — exit", value: "no" },
            ]}
            onSelect={(item) =>
              item.value === "yes"
                ? onFinish({ handoff: [{ cmd: "npm", args: ["run", "dev"], cwd, note: "Starting dev server..." }] })
                : onFinish({})
            }
          />
        </Box>
      )}
    </Box>
  );
}
