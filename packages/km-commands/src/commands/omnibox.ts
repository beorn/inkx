/**
 * Omnibox-specific commands.
 *
 * The `default` command is the universal Enter-fallback for the unified
 * omnibox (Phase 4 of km-tui.omnibox-unified). When a user opens the
 * omnibox without a specific verb chord (`cmd-k`, `cmd-f`), defaultCommand
 * starts at `"default"` — which dispatches based on the target node type.
 *
 * For v1: node target → `CURSOR_TO` (goto). The omnibox confirm handler
 * strips the `node:` / `cmd:` namespace prefix from selectedArgumentId
 * before calling executeCommand, so by the time `default.execute` runs,
 * `ctx.targetId` holds the raw node ID.
 *
 * Future (post-v1): per-node-type customization — tags → filter, projects
 * → zoom, etc. Live fully inside `default.execute()` with zero UI work.
 */
import type { CommandDef } from "../types.ts"

const defaultCommand = {
  id: "default",
  name: "Default action",
  shortLabel: "default",
  description: "Type-dispatched fallback: on a node → go to it",
  category: "Navigation",
  execute: (ctx) => {
    const target = ctx.targetId
    if (!target) return null
    // v1: always goto. Post-v1: switch(nodeType) { case "tag": … }
    return { type: "CURSOR_TO", locationKey: target }
  },
} satisfies CommandDef

/**
 * Development entry point for the unified omnibox (Phase 7b).
 *
 * Emits OPEN_UNIFIED_OMNIBOX — the TUI-side handler (board-actions.ts)
 * builds the full invocation spec from the focused pane's cursor + repo
 * top-level nodes and calls `openOmnibox(setUI, spec)`. Parallel to
 * `command_palette` — lives alongside the legacy omnibox until Phase 12.
 *
 * Bind to Cmd+Shift+K / Ctrl+Shift+K for dev tabbing.
 */
const unifiedOmniboxOpen = {
  id: "unified_omnibox_open",
  name: "Open unified omnibox",
  shortLabel: "omnibox",
  description: "Open the unified sigil-dispatched omnibox (dev)",
  category: "Navigation",
  execute: () => ({ type: "OPEN_UNIFIED_OMNIBOX" }),
} satisfies CommandDef

export const omniboxCommands: CommandDef[] = [defaultCommand, unifiedOmniboxOpen]
