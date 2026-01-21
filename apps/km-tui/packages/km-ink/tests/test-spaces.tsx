import React from "react";
import { createTestRenderer } from "inkx/testing";
import { Box, Text } from "inkx";
import { UIProvider } from "../src/ui-context.tsx";
import { createInitialUIState } from "../src/ui-reducer.ts";
import { TreeNode } from "../src/views/TreeNode.tsx";
import type { KNode } from "@km/core";

const render = createTestRenderer({ rows: 50 });

const mockUIState = createInitialUIState("cards", [], { columns: 80, rows: 24 });
const noopDispatch = () => {};

// Create mock nodes
function createMockNode(id: string, content: string, parentId: string | null = null): KNode {
  return {
    id,
    type: "task",
    parent_id: parentId,
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

const parentNode = createMockNode("parent-1", "Parent task");
const childNode1 = createMockNode("child-1", "Child task 1", "parent-1");
const childNode2 = createMockNode("child-2", "Child task 2", "parent-1");
const childrenMap = new Map<string, KNode[]>();
childrenMap.set("parent-1", [childNode1, childNode2]);

function getChildren(id: string): KNode[] {
  return childrenMap.get(id) ?? [];
}

function getParentContext(): string | null {
  return null;
}

function ExactTreeNodeStructure({ beforeIcon, iconChar, afterIcon, content, backgroundColor, isSelected, shouldDim }: {
  beforeIcon: string;
  iconChar: string;
  afterIcon: string;
  content: string;
  backgroundColor?: string;
  isSelected?: boolean;
  shouldDim?: boolean;
}) {
  return (
    <Box backgroundColor={backgroundColor}>
      <Text
        color={isSelected ? "black" : undefined}
        dimColor={shouldDim}
        wrap="truncate"
      >
        {beforeIcon}
        <Text
          color={isSelected ? "black" : "gray"}
          backgroundColor={isSelected ? undefined : undefined}
        >
          {iconChar}
        </Text>
        {afterIcon}
        {content}
      </Text>
    </Box>
  );
}

// Simulating how TreeNode renders children via NodeChildren
function TreeNodeWithChildren({ parentContent, childContent }: { parentContent: string; childContent: string }) {
  return (
    <Box flexDirection="column">
      {/* Parent at depth 0 */}
      <Box>
        <Text wrap="truncate">
          {" ▼"}
          <Text color="gray">○</Text>
          {" "}
          {parentContent}
        </Text>
      </Box>
      {/* Children rendered via NodeChildren - note Box wrapping */}
      <Box flexDirection="column">
        <Box>
          <Text dimColor wrap="truncate">
            {"   "}
            <Text>○</Text>
            {" "}
            {childContent}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

function TestSpaces() {
  return (
    <Box flexDirection="column">
      <Text>--- Simple cases ---</Text>
      <Text>|{" "}▼○ Parent|</Text>
      <Text>|{"   "}○ Child|</Text>

      <Text>--- Exact TreeNode structure ---</Text>
      <ExactTreeNodeStructure beforeIcon=" ▼" iconChar="○" afterIcon=" " content="Parent" />
      <ExactTreeNodeStructure beforeIcon="   " iconChar="○" afterIcon=" " content="Child" shouldDim />

      <Text>--- In box with border ---</Text>
      <Box borderStyle="round" borderColor="gray" width={30}>
        <ExactTreeNodeStructure beforeIcon=" ▼" iconChar="○" afterIcon=" " content="Parent in box" />
      </Box>
      <Box borderStyle="round" borderColor="gray" width={30}>
        <ExactTreeNodeStructure beforeIcon="   " iconChar="○" afterIcon=" " content="Child in box" shouldDim />
      </Box>

      <Text>--- Parent and child in same bordered box ---</Text>
      <Box flexDirection="column" borderStyle="round" borderColor="gray" width={30}>
        <ExactTreeNodeStructure beforeIcon=" ▼" iconChar="○" afterIcon=" " content="Parent" />
        <ExactTreeNodeStructure beforeIcon="   " iconChar="○" afterIcon=" " content="Child" shouldDim />
      </Box>

      <Text>--- With selection background ---</Text>
      <ExactTreeNodeStructure beforeIcon=" ▼" iconChar="○" afterIcon=" " content="Selected" backgroundColor="yellow" isSelected />

      <Text>--- Wrapped in column Box ---</Text>
      <Box flexDirection="column">
        <ExactTreeNodeStructure beforeIcon=" ▼" iconChar="○" afterIcon=" " content="In column box" />
      </Box>

      <Text>--- Flat Text (no nested Text) ---</Text>
      <Box><Text wrap="truncate">{" ▼○ "}Flat text content</Text></Box>

      <Text>--- Nested Text (like TreeNode) ---</Text>
      <Box>
        <Text wrap="truncate">
          {" ▼"}
          <Text color="gray">○</Text>
          {" "}
          Nested text content
        </Text>
      </Box>

      <Text>--- Exact TreeNode structure (all props) ---</Text>
      <Box flexDirection="column">
        <Box backgroundColor={undefined}>
          <Text
            color={undefined}
            dimColor={false}
            strikethrough={false}
            wrap="truncate"
          >
            {" ▼"}
            <Text color="gray" backgroundColor={undefined}>○</Text>
            {" "}
            Parent task exact
          </Text>
        </Box>
      </Box>

      <Text>--- wrap="wrap" (cards mode) ---</Text>
      <Box flexDirection="column">
        <Box backgroundColor={undefined}>
          <Text wrap="wrap">
            {" ▼"}
            <Text color="gray">○</Text>
            {" "}
            Parent with wrap=wrap
          </Text>
        </Box>
      </Box>

      <Text>--- wrap="truncate" (list mode) ---</Text>
      <Box flexDirection="column">
        <Box backgroundColor={undefined}>
          <Text wrap="truncate">
            {" ▼"}
            <Text color="gray">○</Text>
            {" "}
            Parent with wrap=truncate
          </Text>
        </Box>
      </Box>

      <Text>--- Real TreeNode component ---</Text>
      <TreeNode
        node={parentNode}
        depth={0}
        isSelected={false}
        colIndex={0}
        cardIndex={0}
        subIndex={0}
        getChildren={getChildren}
        getParentContext={getParentContext}
      />

      <Text>--- Leading space tests ---</Text>
      <Text>{" "}leading space via curly braces</Text>
      <Text> leading space directly</Text>
      <Box><Text>{" "}in Box</Text></Box>
      <Box><Text> direct in Box</Text></Box>
      <Box backgroundColor={undefined}><Text>{" "}in Box with bg=undefined</Text></Box>
      <Box backgroundColor="yellow"><Text>{" "}in Box with bg=yellow</Text></Box>

      <Text>--- TreeNodeWithChildren simulation ---</Text>
      <TreeNodeWithChildren parentContent="Parent item" childContent="Child item" />

      <Text>--- TreeNodeWithChildren in bordered box ---</Text>
      <Box borderStyle="round" borderColor="gray" width={30}>
        <TreeNodeWithChildren parentContent="Parent" childContent="Child" />
      </Box>
    </Box>
  );
}

const { lastFrame } = render(
  <UIProvider state={mockUIState} dispatch={noopDispatch}>
    <TestSpaces />
  </UIProvider>
);
console.log(lastFrame());
