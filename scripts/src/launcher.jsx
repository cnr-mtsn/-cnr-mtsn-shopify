// src/launcher.jsx — full-screen tool picker shown when shopify-tools runs bare.
import { useState } from "react";
import { Box, Text, useInput } from "ink";

export const TOOLS = [
  { value: "init", title: "init", desc: "Theme dev setup" },
  { value: "create-node-app", title: "create-node-app", desc: "Node/Express app scaffold" },
  { value: "graphql", title: "graphql", desc: "Admin GraphQL runner" },
];

export function Launcher({ onSelect, onQuit }) {
  const [index, setIndex] = useState(0);

  useInput((input, key) => {
    if (key.upArrow) setIndex((i) => (i + TOOLS.length - 1) % TOOLS.length);
    else if (key.downArrow) setIndex((i) => (i + 1) % TOOLS.length);
    else if (key.return) onSelect(TOOLS[index].value);
    else if (input === "q" || key.escape) onQuit();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} width={52}>
      <Text bold color="cyan">@cnr-mtsn/shopify</Text>
      <Box height={1} />
      {TOOLS.map((tool, i) => {
        const selected = i === index;
        return (
          <Box key={tool.value}>
            <Text color="green">{selected ? "❯ " : "  "}</Text>
            <Box width={18}>
              <Text bold={selected} color={selected ? "green" : undefined}>{tool.title}</Text>
            </Box>
            <Text dimColor>{tool.desc}</Text>
          </Box>
        );
      })}
      <Box height={1} />
      <Text dimColor>↑/↓ navigate · ⏎ run · q quit</Text>
    </Box>
  );
}
