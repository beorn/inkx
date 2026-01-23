import createDebug from "debug";
import type {
  CommandContext,
  CommandAction,
  BoardState,
  TNode,
  ViewMode,
} from "./types.ts";
import { getCommand } from "./registry.ts";

const debug = createDebug("km:commands:executor");

export function executeCommand(
  id: string,
  ctx: CommandContext,
): CommandAction | CommandAction[] | null {
  const cmd = getCommand(id);
  if (!cmd) {
    debug("command not found: %s", id);
    return null;
  }
  debug("executing: %s", id);
  const result = cmd.execute(ctx);
  debug("executed", {
    id,
    result: Array.isArray(result) ? result.map((r) => r.type) : result?.type,
  });
  return result;
}

export function buildContext(
  boardState: BoardState,
  viewMode: ViewMode,
  extras?: Partial<CommandContext>,
): CommandContext {
  const cursor = boardState.cursor;
  const nodes = boardState.nodes;

  // Find current node from cursor path
  let currentNode: TNode | null = null;
  let siblings: TNode[] = nodes;

  for (let i = 0; i < cursor.length; i++) {
    const idx = cursor[i];
    if (idx !== undefined && idx < siblings.length) {
      currentNode = siblings[idx] ?? null;
      if (i < cursor.length - 1 && currentNode && currentNode.children) {
        siblings = currentNode.children;
      }
    }
  }

  return {
    currentNode,
    currentNodeId: currentNode?.id ?? null,
    selectedNodes: Array.from(boardState.selectedNodes),
    cursor,
    boardState,
    viewMode,
    siblingCount: siblings.length,
    siblingIndex: cursor[cursor.length - 1] ?? 0,
    columnIndex: cursor[0] ?? 0,
    columnCount: nodes.length,
    ...extras,
  };
}
