/**
 * Repository Locations
 *
 * Well-known node IDs and dynamic location conventions for composable verbs.
 * Keybindings carry real node IDs (@inbox, @next) or resolvable references
 * (parent, fav:3) as targetId — no intermediate naming layer.
 */

/** Well-known repository location names. Resolved at use time via repo.resolveNode(). */
export const REPO_LOCS = {
  home: "@next",
  inbox: "@inbox",
  journal: "@journal",
  archive: "@archive",
} as const

/** Human-readable names for targetId values (used by which-key popup) */
const TARGET_LABELS: Record<string, string> = {
  "@next": "home",
  "@inbox": "inbox",
  "@journal": "journal",
  "@archive": "archive",
  parent: "parent",
  first: "first",
  last: "last",
}

/** Picker labels for pick:* targets */
const PICKER_LABELS: Record<string, string> = {
  "#": "tag",
  "@": "assignee",
  "+": "project",
  "[": "item",
}

/** Get display label for a targetId */
export function locationLabel(targetId: string): string {
  const label = TARGET_LABELS[targetId]
  if (label) return label
  if (targetId.startsWith("fav:")) return `fav ${targetId.slice(4)}`
  if (targetId.startsWith("pick:")) return PICKER_LABELS[targetId.slice(5)] ?? targetId.slice(5)
  return targetId.replace(/^@/, "")
}
