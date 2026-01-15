import { ensureState, getNode } from "@km/store";
import { getNodeDisplayName, getParentContext } from "@km/shared";
import { initBoardState } from "../src/tui/state.ts";
import { renderRich, constrainText } from "../src/tui/render-text.ts";

async function debug() {
  const root = "/tmp/tst-repo";
  const board = "@next.md";

  console.log("Opening vault:", root);
  await ensureState(root);

  const state = initBoardState(board);
  if (!state) {
    console.log("Could not init board state");
    return;
  }
  console.log("Columns:", state.columns.length);

  // Check first column's first few cards
  const col = state.columns[0];
  if (!col) {
    console.log("No columns found!");
    return;
  }

  console.log("\nColumn:", getNodeDisplayName(col.node));
  console.log("Cards:", col.cards.length);

  for (let i = 0; i < Math.min(5, col.cards.length); i++) {
    const card = col.cards[i];
    if (!card) continue;

    const node = card.node;
    console.log(`\n--- Card ${i} ---`);
    console.log("Node ID:", node.id);
    console.log("Node type:", node.type);
    console.log("Node content:", JSON.stringify(node.content?.slice(0, 50)));
    console.log("Display name:", getNodeDisplayName(node));
    console.log("Is symlink:", !!node.symlink_to);

    if (node.symlink_to) {
      const originalNode = getNode(node.symlink_to);
      console.log(
        "Original content:",
        JSON.stringify(originalNode?.content?.slice(0, 50)),
      );
    }

    const parentContext = getParentContext(node);
    console.log("Parent context:", parentContext);

    // Simulate TreeNode rendering with realistic width calculation
    const rawContent = node.content || getNodeDisplayName(node);
    const styledContent = renderRich(rawContent);
    console.log("Raw content:", rawContent?.slice(0, 50));

    // Realistic compact mode width calculation
    // Column width ~35, minus 2 for column border, minus 2 for card border = 31
    const cardInnerWidth = 31;

    // Prefix: indent(0) + fold(1) + icon(1) + space(1) = 3
    const prefixLength = 3;

    // Context suffix in compact mode: max 15 chars
    const maxContextLen = 15;
    const truncatedContext = parentContext
      ? parentContext.length > maxContextLen
        ? parentContext.slice(0, maxContextLen - 1) + "…"
        : parentContext
      : null;
    const contextSuffix = truncatedContext ? ` < ${truncatedContext}` : "";

    const fixedWidth = prefixLength + contextSuffix.length;
    const availWidth = Math.max(1, cardInnerWidth - fixedWidth);

    console.log("Card inner width:", cardInnerWidth);
    console.log(
      "Context suffix:",
      JSON.stringify(contextSuffix),
      "len:",
      contextSuffix.length,
    );
    console.log("Available width for content:", availWidth);

    const { lines } = constrainText(styledContent, availWidth, 1);
    console.log("First line:", JSON.stringify(lines[0]));
  }
}

debug().catch(console.error);
