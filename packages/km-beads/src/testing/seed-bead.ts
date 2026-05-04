/**
 * `seedBead` — thin bd-CLI-conventional wrapper around `seedFileNode`.
 *
 * The universal half of the work (file materialization, ancestor folder
 * creation, fs_path / name / fstype) lives in `@km/storage`. This wrapper
 * just defaults the bd-CLI-conventional frontmatter shape (`type: "task"`,
 * `priority: "P2"`) and delegates.
 *
 * Splitting them lets the universal half serve memories, contacts, future
 * tasks, etc., while bead-conventional defaults stay where they belong.
 *
 * Bead: @km/beads/seed-bead-as-thin-wrapper
 */

import { seedFileNode, type Repo, type SeededFileNode } from "@km/storage"

export interface SeedBeadOptions {
  title?: string
  type?: "task" | "bug" | "feature" | "epic"
  priority?: "P0" | "P1" | "P2" | "P3" | "P4"
  status?: "open" | "in-progress" | "blocked" | "closed"
  /** Aliases (e.g. legacy bd-form ids) — passed through to seedFileNode. */
  aliases?: string[]
}

/**
 * Seed a bead-shaped fs-materialized node via the universal `seedFileNode`
 * helper, defaulting the frontmatter shape that bd-style beads expect.
 */
export function seedBead(repo: Repo, path: string, options: SeedBeadOptions = {}): SeededFileNode {
  const frontmatter: Record<string, unknown> = {
    type: options.type ?? "task",
    priority: options.priority ?? "P2",
  }
  if (options.status) frontmatter.status = options.status

  return seedFileNode(repo, path, {
    frontmatter,
    body: options.title ? `# ${options.title}\n` : "",
    fstype: "mdfile",
    aliases: options.aliases,
  })
}
