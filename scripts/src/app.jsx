// src/app.jsx — routes between the launcher and tool screens inside one Ink app.
import { useState } from "react";
import { useApp } from "ink";
import { Launcher } from "./launcher.jsx";
import { InitTool } from "./tools/init.jsx";
import { CreateNodeAppTool } from "./tools/create-node-app.jsx";
import { GraphqlTool } from "./tools/graphql.jsx";

const SCREENS = {
  init: InitTool,
  "create-node-app": CreateNodeAppTool,
  graphql: GraphqlTool,
};

export function App({ initialTool, onDone }) {
  const { exit } = useApp();
  const [tool, setTool] = useState(initialTool);

  // Tools call onFinish exactly once; record the result, then unmount Ink so
  // cli.jsx can run any handoff with the terminal released.
  const finish = (result = {}) => {
    onDone(result);
    exit();
  };

  if (!tool) return <Launcher onSelect={setTool} onQuit={() => finish({})} />;
  const Screen = SCREENS[tool];
  return <Screen onFinish={finish} />;
}
