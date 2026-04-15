/**
 * Command availability — pre-filter for offering commands to the user.
 *
 * The unified omnibox, command palette, keybinding resolver, and any other
 * surface that lists commands should call `isCommandAvailable` before
 * showing one. Two gates compose:
 *
 *   1. `def.modes` (coarse) — required if the surface knows the current
 *      CommandMode. Skips the check when no mode is supplied.
 *   2. `def.when` (precise) — a WhenPredicate evaluated against the current
 *      KeybindingContext. Cross-field predicates like
 *      `and(hasCursor, not(textInputFocused))` go here.
 *
 * Phase 8 of km-tui.omnibox-unified. Additive — existing commands without
 * `when` and without `modes` always pass, so this is a safe drop-in.
 *
 * Note: availability is a pre-filter, NOT an execute-time guard. The
 * executor still runs whatever id is dispatched, by design — direct
 * `executeCommand` callers (tests, programmatic dispatch) bypass UI
 * filtering on purpose.
 */
import type { CommandDef, CommandMode } from "./types.ts"
import type { KeybindingContext } from "./keybindings.ts"

/**
 * Check whether `def` should be offered to the user given the current
 * keybinding context (and optionally the current command mode).
 *
 * Logic:
 *   - If `def.modes` is set AND `mode` is supplied, the command is
 *     unavailable when `!def.modes.includes(mode)`.
 *   - If `def.when` is set, the command is unavailable when
 *     `def.when(ctx)` returns false.
 *   - Otherwise the command is available.
 *
 * Both gates must pass when both are present.
 */
export function isCommandAvailable(
  def: CommandDef,
  ctx: KeybindingContext,
  mode?: CommandMode,
): boolean {
  if (def.modes && def.modes.length > 0 && mode !== undefined) {
    if (!def.modes.includes(mode)) return false
  }
  if (def.when && !def.when(ctx)) return false
  return true
}
