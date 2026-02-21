/**
 * Help Screen Data
 *
 * Generates structured help data from the keybinding registry and command
 * definitions. Used by HelpOverlay to render auto-generated keyboard
 * shortcut reference instead of hardcoded content.
 */

import { defaultKeybindingLayers } from "./keybindings.ts"
import type { Keybinding } from "./keybindings.ts"
import { allCommands } from "./commands/index.ts"
import type { CommandDef } from "./types.ts"

export interface HelpItem {
  keys: string[]
  command: string
  description: string
}

export interface HelpSection {
  category: string
  items: HelpItem[]
}

/** Command IDs to exclude from help (internal/modal/low-level) */
const EXCLUDED_COMMANDS = new Set([
  "noop",
  "bell",
  // Modal/dialog internal commands
  "help.dismiss",
  "help.scroll_up",
  "help.scroll_down",
  "delete_confirm.confirm",
  "delete_confirm.cancel",
  "console.close",
  "toast.dismiss",
  "dev.test_toast",
  // Dialog navigation (internal plumbing)
  "dialog.nav_up",
  "dialog.nav_down",
  "dialog.nav_left",
  "dialog.nav_right",
  "dialog.confirm",
  "dialog.cancel",
  "dialog.toggle_search_scope",
  "filter.nav_left",
  "filter.nav_right",
  "filter.clear_all",
  // Move mode confirm/cancel (contextual)
  "confirm_move",
  "cancel_move",
  // Search replace internal
  "search_replace.close",
  "search_replace.next",
  "search_replace.prev",
  "search_replace.replace",
  "search_replace.replace_all",
  "search_replace.toggle_regex",
  "search_replace.tab_field",
  // Find bar internal
  "find_next",
  "find_prev",
  "find_close",
  "find_confirm",
  // Visual mode exit (contextual)
  "visual_mode_exit",
  // Text editing (shown only when editing, not in help)
  "text.delete_backward",
  "text.delete_forward",
  "text.cursor_left",
  "text.cursor_right",
  "text.cursor_up",
  "text.cursor_down",
  "text.cursor_start",
  "text.cursor_end",
  "text.delete_word",
  "text.delete_to_start",
  "text.delete_to_end",
  "text.confirm",
  "text.exit_edit",
  "text.yank",
  "text.bold",
  "text.italic",
  // Block editing (internal)
  "edit_block.navigate_up",
  "edit_block.navigate_down",
  // Detail pane scrolling (internal)
  "detail_pane.scroll_down",
  "detail_pane.scroll_up",
  // Close/quit is generic Escape behavior
  "close_or_quit",
  // Generated favorites/column commands (too many, listed as range)
  ...Array.from({ length: 9 }, (_, i) => `favorite_${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `column_${i + 1}`),
])

/** Layers to skip entirely (they contain internal/modal bindings) */
const EXCLUDED_LAYERS = new Set([
  "modal",
  "text",
  "block-edit",
  "inline-edit-barrier",
  "detail-pane",
  "visual-mode",
  "dialog",
  "filter-dialog",
  "search-replace",
  "local-find",
])

/** Map layer names to user-facing help categories */
const LAYER_CATEGORY_MAP: Record<string, string> = {
  global: "Global",
  navigation: "Navigation",
  selection: "Selection",
  edit: "Editing",
  task: "Task",
  fold: "Fold & Chords",
  view: "View",
  history: "History",
  tui: "System",
}

/** Format a keybinding into a human-readable key string */
function formatKey(binding: Keybinding): string {
  const parts: string[] = []

  if (binding.ctrl) parts.push("C")
  if (binding.meta) parts.push("M")
  if (binding.super) parts.push("Cmd")
  if (binding.alt) parts.push("Alt")
  if (binding.shift) parts.push("S")

  // Friendly key names
  let keyName = binding.key
  switch (keyName) {
    case "ArrowUp":
      keyName = "Up"
      break
    case "ArrowDown":
      keyName = "Down"
      break
    case "ArrowLeft":
      keyName = "Left"
      break
    case "ArrowRight":
      keyName = "Right"
      break
    case "Backspace":
      keyName = "BS"
      break
    case "Delete":
      keyName = "Del"
      break
    case "Escape":
      keyName = "Esc"
      break
    case " ":
      keyName = "Space"
      break
  }

  if (binding.chord) {
    // Chord: show as prefix->key
    const prefix = binding.chord
    if (parts.length > 0) {
      return `${prefix}->${parts.join("+")}+${keyName}`
    }
    return `${prefix}->${keyName}`
  }

  if (parts.length > 0) {
    return `${parts.join("+")}+${keyName}`
  }
  return keyName
}

/**
 * Build help screen data from the keybinding registry.
 *
 * Iterates all keybinding layers, collects key->commandId mappings,
 * resolves command name/description from the command definitions,
 * and groups by layer-derived category.
 */
export function getHelpScreenData(): HelpSection[] {
  // Build command lookup map
  const commandMap = new Map<string, CommandDef>()
  for (const cmd of allCommands) {
    commandMap.set(cmd.id, cmd)
  }

  const sections: HelpSection[] = []

  for (const layer of defaultKeybindingLayers) {
    if (EXCLUDED_LAYERS.has(layer.name)) continue

    const category = LAYER_CATEGORY_MAP[layer.name] ?? layer.name

    // Collect items: group bindings by commandId to merge keys
    const commandOrder: string[] = []
    const commandKeys = new Map<string, string[]>()

    for (const binding of layer.bindings) {
      if (binding.wildcard) continue
      if (EXCLUDED_COMMANDS.has(binding.commandId)) continue

      const key = formatKey(binding)
      const existing = commandKeys.get(binding.commandId)
      if (existing) {
        // Avoid duplicate display keys; cap at 2 alternatives to prevent overflow
        if (existing.length < 2 && !existing.includes(key)) {
          existing.push(key)
        }
      } else {
        commandOrder.push(binding.commandId)
        commandKeys.set(binding.commandId, [key])
      }
    }

    if (commandOrder.length === 0) continue

    const items: HelpItem[] = []
    for (const cmdId of commandOrder) {
      const cmd = commandMap.get(cmdId)
      const keys = commandKeys.get(cmdId) ?? []
      items.push({
        keys,
        command: cmd?.name ?? cmdId,
        description: cmd?.description ?? cmd?.name ?? cmdId,
      })
    }

    // Merge into existing section with same category, or create new
    const existingSection = sections.find((s) => s.category === category)
    if (existingSection) {
      existingSection.items.push(...items)
    } else {
      sections.push({ category, items })
    }
  }

  return sections
}
