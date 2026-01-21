import React from "react";
import { createTestRenderer } from "inkx/testing";
import { Box, Text } from "inkx";
import { UIProvider } from "../src/ui-context.tsx";
import { createInitialUIState } from "../src/ui-reducer.ts";
import { TreeNode } from "../src/views/TreeNode.tsx";
import { getNodeIcon } from "../src/text/index.ts";
import { getOwnColor } from "../src/board-pills.ts";
import type { KNode } from "@km/core";

const render = createTestRenderer({ rows: 30 });

const mockUIState = createInitialUIState("cards", [], { columns: 80, rows: 24 });
const noopDispatch = () => {};

// Create a colored node (section with a color in rules)
function createColoredNode(id: string, content: string, color: string): KNode {
  return {
    id,
    type: "section",
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    content,
    title: content,
    task_status: null,
    // Color should be in rules, not data directly
    rules: { color },
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "1",
  };
}

// Regular task node (no color)
function createTaskNode(id: string, content: string): KNode {
  return {
    id,
    type: "task",
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    content,
    task_status: "todo",
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "1",
  };
}

const redNode = createColoredNode("red-1", "Red Section", "red");
const blueNode = createColoredNode("blue-1", "Blue Section", "blue");
const taskNode = createTaskNode("task-1", "Regular Task");

// Debug: check what getOwnColor and getNodeIcon return
console.error("DEBUG: redNode.rules =", redNode.rules);
console.error("DEBUG: getOwnColor(redNode) =", getOwnColor(redNode));
console.error("DEBUG: getNodeIcon(null, 'red', false) =", getNodeIcon(null, "red", false));
console.error("DEBUG: getNodeIcon(null, getOwnColor(redNode), false) =", getNodeIcon(null, getOwnColor(redNode), false));

function getChildren(): KNode[] {
  return [];
}

function getParentContext(): string | null {
  return null;
}

function TestColoredIcons() {
  return (
    <Box flexDirection="column">
      <Text>--- Colored node NOT selected ---</Text>
      <TreeNode
        node={redNode}
        depth={0}
        isSelected={false}
        colIndex={0}
        cardIndex={0}
        subIndex={0}
        getChildren={getChildren}
        getParentContext={getParentContext}
      />
      
      <Text>--- Colored node SELECTED (icon should be red ●) ---</Text>
      <TreeNode
        node={redNode}
        depth={0}
        isSelected={true}
        colIndex={0}
        cardIndex={0}
        subIndex={0}
        getChildren={getChildren}
        getParentContext={getParentContext}
      />
      
      <Text>--- Blue node SELECTED (icon should be blue ●) ---</Text>
      <TreeNode
        node={blueNode}
        depth={0}
        isSelected={true}
        colIndex={0}
        cardIndex={0}
        subIndex={0}
        getChildren={getChildren}
        getParentContext={getParentContext}
      />
      
      <Text>--- Direct Text with red color ---</Text>
      <Box backgroundColor="yellow">
        <Text color="red">● This should be red</Text>
      </Box>
      
      <Text>--- Regular task SELECTED (icon should be black on yellow) ---</Text>
      <TreeNode
        node={taskNode}
        depth={0}
        isSelected={true}
        colIndex={0}
        cardIndex={0}
        subIndex={0}
        getChildren={getChildren}
        getParentContext={getParentContext}
      />
    </Box>
  );
}

const { lastFrame } = render(
  <UIProvider state={mockUIState} dispatch={noopDispatch}>
    <TestColoredIcons />
  </UIProvider>
);
console.log(lastFrame());
