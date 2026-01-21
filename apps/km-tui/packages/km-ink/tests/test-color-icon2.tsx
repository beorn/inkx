import React from "react";
import { createTestRenderer } from "inkx/testing";
import { Box, Text } from "inkx";
import { UIProvider } from "../src/ui-context.tsx";
import { createInitialUIState } from "../src/ui-reducer.ts";
import { getNodeStyle, buildPrefix } from "../src/views/tree-node-helpers.ts";
import type { KNode } from "@km/core";

const render = createTestRenderer({ rows: 20 });

const mockUIState = createInitialUIState("cards", [], { columns: 80, rows: 24 });
const noopDispatch = () => {};

// Create a colored node (section with a color in rules)
const redNode: KNode = {
  id: "red-1",
  type: "section",
  parent_id: null,
  parent_idx: 0,
  link_to: null,
  content: "Red Section",
  title: "Red Section",
  task_status: null,
  rules: { color: "red" },
  data: {},
  created_at: Date.now(),
  updated_at: Date.now(),
  version: "1",
};

// Debug: check what getNodeStyle and buildPrefix return
const style = getNodeStyle(redNode, true, false, false, 0);
console.error("DEBUG: style =", JSON.stringify(style, null, 2));

const prefix = buildPrefix(0, false, false, 0, style.icon);
console.error("DEBUG: prefix =", JSON.stringify(prefix, null, 2));

function TestColorDebug() {
  return (
    <Box flexDirection="column">
      <Text>--- Testing icon color directly ---</Text>
      <Box backgroundColor="yellow">
        <Text>{" "}</Text>
        <Text color={prefix.iconColor}>{prefix.iconChar}</Text>
        <Text> Content with explicit color={prefix.iconColor ?? "undefined"}</Text>
      </Box>
      <Text>---</Text>
      <Box backgroundColor="yellow">
        <Text>{" "}</Text>
        <Text color="red">●</Text>
        <Text> Content with hardcoded color=red</Text>
      </Box>
    </Box>
  );
}

const { lastFrame } = render(
  <UIProvider state={mockUIState} dispatch={noopDispatch}>
    <TestColorDebug />
  </UIProvider>
);
console.log(lastFrame());
