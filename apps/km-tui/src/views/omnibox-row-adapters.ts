/**
 * OmniboxRow adapters — convert domain objects into OmniboxRowData.
 *
 * The omnibox renders commands, nodes, favorites, and search results
 * through one unified row component (OmniboxRow). This module owns the
 * per-type conversions so the row component stays type-agnostic.
 */
import type { KNode } from "@km/core"
import type { CommandDef } from "@km/commands"
import { getNodeIcon } from "../icons.ts"
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
    id: `cmd:${cmd.id}`,
    icon: "",
    iconColor: "$primary",
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
  const iconInfo = getNodeIcon(node.item?.task?.status, undefined, node.item?.task?.marker !== undefined)
  // Prefer content (body), then title (heading), then name (filename). `||`
  // falls through empty strings so a file with no body but a meaningful name
  // still renders its name — matches the identity-first ranking in
  // scoreNodeForOmnibox (see omnibox-projection.ts).
  const title = node.content || node.title || node.name || node.id
  return {
    id: `node:${node.id}`,
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
 * Convert a favorite entry (key + node) into a row descriptor.
 * Hint is the single-letter key that jumps to it.
 */
export function favoriteToRow(
  key: string,
  node: KNode,
  opts: { parentContext?: string | null; isSelected?: boolean } = {},
): OmniboxRowData {
  const base = nodeToRow(node, { parentContext: opts.parentContext, isSelected: opts.isSelected })
  return { ...base, id: `fav:${key}`, hint: key.toUpperCase() }
}
