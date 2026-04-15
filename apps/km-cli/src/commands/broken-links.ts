/**
 * Shared broken-wikilink detection and formatting.
 *
 * Used by `km list --broken` (via list.ts) and `km doctor links`
 * (via doctor.ts) — both produce the same output. doctor.ts delegates
 * to this module so the two commands stay in sync.
 *
 * Scoping: pass `scope` to restrict results to links whose source is
 * the scope node or a descendant. Matches the path-like query semantics
 * of `km list` (e.g. `km list --broken @next.md` scopes to the
 * @next.md subtree).
 */

import type { Database } from "bun:sqlite"
import type { createTerm } from "@silvery/ag-react"

export interface BrokenLink {
  source_id: string
  source_path: string | null
  target_name: string
  section: string | null
  embedded: boolean
}

/**
 * Query all broken wikilinks in the repo. A link is "broken" when its
 * target_id is null — i.e. the wikilink was parsed but the parser couldn't
 * resolve it to a known node. Results are sorted by source path + target
 * for stable grouped output.
 */
export function getBrokenLinks(db: Database): BrokenLink[] {
  return db
    .query(
      `
    SELECT l.source_id, n.fs_path as source_path, l.target_name, l.section, l.embedded
    FROM links l
    LEFT JOIN nodes n ON n.id = l.source_id
    WHERE l.target_id IS NULL
    ORDER BY n.fs_path, l.target_name
  `,
    )
    .all() as BrokenLink[]
}

export function getBrokenLinkCount(db: Database): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM links WHERE target_id IS NULL").get() as { count: number }
  return row.count
}

/**
 * Filter broken links to those whose source is within a scope subtree.
 *
 * `scopeNodeIds` is the set of node IDs that count as "inside scope".
 * The caller computes this from a query/path argument (e.g. by walking
 * descendants of the matched node). Passing undefined / empty returns
 * the original array unchanged.
 */
export function filterBrokenLinksByScope(links: BrokenLink[], scopeNodeIds: Set<string> | undefined): BrokenLink[] {
  if (!scopeNodeIds || scopeNodeIds.size === 0) return links
  return links.filter((l) => scopeNodeIds.has(l.source_id))
}

/**
 * Print broken links to stdout, grouped by source file. Matches the
 * original `km doctor links` output so both command entry points produce
 * identical results.
 */
export function printBrokenLinks(
  links: BrokenLink[],
  term: ReturnType<typeof createTerm>,
  options: { scopeLabel?: string } = {},
): void {
  const scopeSuffix = options.scopeLabel ? ` in ${options.scopeLabel}` : ""

  if (links.length === 0) {
    console.log(term.green(`  ✓ No broken wikilinks${scopeSuffix}`))
    return
  }

  console.log(`  ${links.length} broken wikilink(s)${scopeSuffix}:`)
  console.log()

  // Group by source file for readability
  const bySource = new Map<string, BrokenLink[]>()
  for (const link of links) {
    const key = link.source_path ?? link.source_id
    const existing = bySource.get(key)
    if (existing) existing.push(link)
    else bySource.set(key, [link])
  }

  for (const [source, sourceLinks] of bySource) {
    console.log(`  ${source}`)
    for (const link of sourceLinks) {
      const section = link.section ? `#${link.section}` : ""
      const type = link.embedded ? "embed" : "link"
      console.log(term.dim(`    -> [[${link.target_name}${section}]]`), term.dim(`(${type})`))
    }
  }
}
