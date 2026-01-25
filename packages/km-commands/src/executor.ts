import createDebug from "debug";
import type { CommandContext, CommandAction, ViewMode } from "./types.ts";
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

/**
 * Build a CommandContext from provided fields.
 *
 * All fields are passed directly - no tree traversal needed.
 * The caller (TUI) computes currentNode, position info from its own state.
 */
export function buildContext(
  viewMode: ViewMode,
  fields: Omit<CommandContext, "viewMode">,
): CommandContext {
  return {
    viewMode,
    ...fields,
  };
}
