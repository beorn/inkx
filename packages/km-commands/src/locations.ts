/**
 * Repository Locations
 *
 * Well-known node IDs and dynamic location conventions for composable verbs.
 * Keybindings carry real node IDs (@inbox, @next) or resolvable references
 * (parent, fav:3) as targetId — no intermediate naming layer.
 */

/** Default names for well-known locations (used as fallback for resolveNode) */
const DEFAULT_NAMES: Record<string, string> = {
  home: "@next",
  inbox: "@inbox",
  journal: "@journal",
  archive: "@archive",
}

/** Resolved node IDs for well-known locations. Populated by setLocationId() at repo load. */
const resolvedIds: Record<string, string> = { ...DEFAULT_NAMES }

/** Well-known repository locations — returns resolved IDs if available, else default names */
export const REPO_LOCS = {
  get home(): string {
    return resolvedIds.home!
  },
  get inbox(): string {
    return resolvedIds.inbox!
  },
  get journal(): string {
    return resolvedIds.journal!
  },
  get archive(): string {
    return resolvedIds.archive!
  },
}

/** Set the resolved node ID for a well-known location. Called at repo load. */
export function setLocationId(location: keyof typeof DEFAULT_NAMES, nodeId: string): void {
  resolvedIds[location] = nodeId
}

/** Resolve all well-known locations from a repo. Call once after repo loads. */
export function resolveLocations(resolveNode: (name: string) => { id: string } | null): void {
  for (const [loc, name] of Object.entries(DEFAULT_NAMES)) {
    const node = resolveNode(name)
    if (node) resolvedIds[loc] = node.id
  }
}

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
