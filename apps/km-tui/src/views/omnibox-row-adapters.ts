/**
 * OmniboxRow adapters — convert domain objects into OmniboxRowData.
 *
 * The omnibox renders commands, nodes, and search results through one
 * unified row component (OmniboxRow). This module owns the per-type
 * conversions so the row component stays type-agnostic. Rows carry a
 * `kind` discriminator and a raw domain id (no "cmd:"/"node:" prefix
 * encoding — consumers branch on `kind`).
 */
import type { KNode } from "@km/core"
import type { CommandDef } from "@km/commands"
import { getNodeIcon, getTypeBullet } from "../icons.ts"
import type { OmniboxRowData } from "./OmniboxRow.tsx"

/**
 * Convert a registered command into a row descriptor.
 *
 * - `hint` is the keybinding (if any) or the command's category tag.
 * - `disabled` reflects the availability check (not implemented yet — Phase 8).
 * - `context` shows the command description, truncated by the row box.
 */
export function commandToRow(
  cmd: CommandDef,
  opts: {
    keybindingHint?: string
    isSelected?: boolean
    disabled?: boolean
  } = {},
): OmniboxRowData {
  return {
    id: cmd.id,
    kind: "command",
    // Grey `:` marker so command rows left-align with node rows (both icons
    // now occupy the same 1-char column) and are still visually distinct
    // from content. Matches the command sigil so the glyph doubles as a
    // "this is a command" hint.
    icon: ":",
    iconColor: "$muted",
    title: cmd.name,
    context: cmd.description,
    hint: opts.keybindingHint ?? cmd.category,
    isSelected: opts.isSelected,
    disabled: opts.disabled,
  }
}

/**
 * Convert a KNode into a row descriptor.
 *
 * - `icon` comes from getNodeIcon (task-status-aware).
 * - `context` is the parent breadcrumb (supplied by caller — we don't
 *   traverse the repo here to keep this pure).
 * - `hint` is typically omitted for nodes but can carry a scope tag
 *   (e.g. "recent", "favorite") from the caller.
 */
export function nodeToRow(
  node: KNode,
  opts: {
    parentContext?: string | null
    hint?: string
    isSelected?: boolean
    disabled?: boolean
  } = {},
): OmniboxRowData {
  const iconInfo = iconForNode(node)
  // Prefer content (body), then title (heading), then name (filename). `||`
  // falls through empty strings so a file with no body but a meaningful name
  // still renders its name — matches the identity-first ranking in
  // scoreNodeForOmnibox (see omnibox-projection.ts).
  const title = node.content || node.title || node.name || node.id
  return {
    id: node.id,
    kind: "node",
    icon: iconInfo.char,
    iconColor: iconInfo.color,
    title,
    context: opts.parentContext ?? undefined,
    hint: opts.hint,
    isSelected: opts.isSelected,
    disabled: opts.disabled,
  }
}

/**
 * Pick the right icon for a node — matches the board view's algorithm so
 * search results look visually consistent with the cards/columns they
 * represent.
 *
 *   - Tasks → task-status icon (`✓`, `□`, etc.) via getNodeIcon
 *   - Folders / files / sections / outlines / list items → typed bullet
 *     via getTypeBullet (file-text-o, folder-o, §, •, ·)
 *   - Fallback → middle dot
 */
function iconForNode(node: KNode): { char: string; color: string } {
  const isTask = node.item?.task?.status != null || node.item?.task?.marker !== undefined
  if (isTask) {
    return getNodeIcon(node.item?.task?.status, undefined, true)
  }
  // hasChildren isn't exposed on KNode directly (children live in the repo,
  // not on the node). getTypeBullet only uses hasChildren for list-item
  // variants — default false is fine for omnibox rows; the bullet style
  // still conveys type, just without the "has children" filled variant.
  const bullet = getTypeBullet(node, false)
  return bullet ?? { char: "\u00B7", color: "$muted" }
}
