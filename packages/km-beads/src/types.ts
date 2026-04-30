/**
 * Bead — bd-tracked issue value type.
 *
 * The legacy aliases (`Issue`, `IssueFilter`, `CreateIssueOptions`) and the
 * legacy module-level functions (`nodeToBead`, `displayId`, etc.) have
 * been removed in the L4 cutover. New code uses `Bead`, `BeadFilter`,
 * `BeadCreateOptions`. See `./bead.ts` for the namespace.
 */
export interface Bead {
  id: string // Full node ID (ULID)
  /**
   * Short ID — frontmatter `id:` (canonical path-form, e.g.
   * `@km/scope/slug`) or legacy `data.short_id` (bd-form, e.g. `km-a1b2`).
   *
   * `undefined` when neither is present — i.e. the KNode is not a real
   * bead (sub-checkbox descendant, raw `bd query` hit, in-file paragraph
   * surfaced via `bd children`, etc.). At the namespace boundary,
   * `Bead.from(node)` returns `null` for such nodes; consumers that get
   * a `Bead` value can rely on `shortId` being defined. Legacy callers
   * that go through `nodeToBead` directly may still see `undefined`.
   */
  shortId: string | undefined
  title: string
  description?: string // Full description/content
  status: "todo" | "wip" | "blocked" | "done" | "dropped"
  priority: string // Free-form string (e.g., "P0"-"P4", "high", "A")
  type?: string // bug, feature, epic, task, docs (issue_type in bd)
  assignee?: string
  blockedBy?: string[] // Short IDs of blockers
  createdAt: number
  updatedAt: number
  // Path/context fields for bd compatibility
  path?: string // File path (from fs_path or parent's fs_path)
  parentContext?: string // Parent section/file name for embedded nodes
  // bd-compatible fields
  createdBy?: string // Author
  dependencyCount?: number // Number of beads this depends on
  dependentCount?: number // Number of beads that depend on this
}

/**
 * Minimal filesystem interface for DI.
 *
 * Consumers inject this so km-beads never imports node:fs directly,
 * keeping filesystem access in the storage layer (or test doubles).
 */
export interface BeadsFs {
  existsSync(path: string): boolean
  readFileSync(path: string, encoding: "utf-8"): string
  writeFileSync(path: string, content: string, encoding: "utf-8"): void
  mkdirSync(path: string, options: { recursive: boolean }): void
}

export interface BeadFilter {
  status?: string | string[]
  priority?: string
  type?: string
  assignee?: string
  blocked?: boolean
}

export interface BeadCreateOptions {
  type?: string
  priority?: string
  assignee?: string
  labels?: string[]
  customId?: string // Custom short ID
  parentId?: string // For sub-issues
  path?: string // Where to create
  description?: string // Body text (created as child paragraph)
  notes?: string // Additional notes (created as child paragraph after description)
  /**
   * Bead id prefix (e.g. `km`, `gbrain`, `pim`). Required — comes from the
   * repo's `.km/config.yaml` `beads.prefix` (read via `loadKmBdConfig` or
   * `getBeadsConfig`). No default: a missing prefix would silently produce
   * `km-…` ids in non-`km` repos (cloudi, pam, pim vault).
   */
  prefix: string
}

