import { createLogger } from "loggily"
import type { CommandContext, KmOp, ViewMode } from "./types.ts"
import { getCommand } from "./registry.ts"

const log = createLogger("km:commands:executor")

export function executeCommand(id: string, ctx: CommandContext, targetId?: string): KmOp | KmOp[] | null {
  const cmd = getCommand(id)
  if (!cmd) {
    log.debug?.(`command not found: ${id}`)
    return null
  }
  log.debug?.(`executing: ${id}`)
  const effectiveCtx = targetId ? { ...ctx, targetId } : ctx
  const result = cmd.execute(effectiveCtx)
  log.debug?.("executed", {
    id,
    result: Array.isArray(result) ? result.map((r) => r.type) : result?.type,
  })
  return result
}

/**
 * Build a CommandContext from provided fields.
 *
 * All fields are passed directly - no tree traversal needed.
 * The caller (TUI) computes currentNode, position info from its own state.
 */
export function buildContext(viewMode: ViewMode, fields: Omit<CommandContext, "viewMode">): CommandContext {
  return {
    viewMode,
    ...fields,
  }
}
