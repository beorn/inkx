/**
 * Shared broken-wikilink detection and formatting.
 *
 * Used by `km list --broken` (via list.ts) and `km doctor links`
 * (via doctor.ts) — both produce the same output. doctor.ts delegates
 * to this module so the two commands stay in sync.
 *
 * Scoping: pass `scope` to restrict results to links whose source is
 * the scope node or a descendant.
 *
 * Under the v4 links schema (see docs/design/links.md), a link row is
 * (host_id, href, rel). Resolution is runtime: a link is "broken" when
 * its href is a `km:` reference whose name doesn't resolve in the name
 * index built from node names and paths.
 */

import type { Database } from "bun:sqlite"
import type { createTerm } from "@silvery/ag-react"

export interface BrokenLink {
  host_id: string
  host_path: string | null
  href: string
  rel: "link" | "embed"
}

interface LinkRow {
  host_id: string
  host_path: string | null
  href: string
  rel: "link" | "embed"
}

/**
 * Query all broken wikilinks in the repo.
 *
 * A link is broken when its href looks up as an internal name (scheme
 * `km:`), has no fragment, and no node name or fs_path matches. External
 * schemes (https://, mailto:) and self-refs (#section) are never broken.
 *
 * Results are sorted by source path + href for stable grouped output.
 */
export function getBrokenLinks(db: Database): BrokenLink[] {
  const rows = db
    .query(
      `
    SELECT l.host_id, n.fs_path as host_path, l.href, l.rel
    FROM links l
    LEFT JOIN nodes n ON n.id = l.host_id
    WHERE l.href LIKE 'km:%'
    ORDER BY n.fs_path, l.href
  `,
    )
    .all() as LinkRow[]

  // Build a name index of known targets. Keys are lowercased for the
  // case-insensitive lookup documented in docs/design/links.md.
  const known = new Set<string>()
  const nodeRows = db.query("SELECT name, fs_path FROM nodes").all() as Array<{
    name: string | null
    fs_path: string | null
  }>
  for (const n of nodeRows) {
    if (n.name) known.add(n.name.toLowerCase())
    if (n.fs_path) {
      const stem = n.fs_path.replace(/^\.\//, "").replace(/\.md$/, "")
      if (stem) known.add(stem.toLowerCase())
    }
  }

  return rows.filter((row) => {
    const name = extractKmName(row.href)
    if (!name) return false
    return !known.has(name.toLowerCase())
  })
}

export function getBrokenLinkCount(db: Database): number {
  return getBrokenLinks(db).length
}

/**
 * Filter broken links to those whose host is within a scope subtree.
 */
export function filterBrokenLinksByScope(links: BrokenLink[], scopeNodeIds: Set<string> | undefined): BrokenLink[] {
  if (!scopeNodeIds || scopeNodeIds.size === 0) return links
  return links.filter((l) => scopeNodeIds.has(l.host_id))
}

/**
 * Print broken links to stdout, grouped by host file.
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
    const key = link.host_path ?? link.host_id
    const existing = bySource.get(key)
    if (existing) existing.push(link)
    else bySource.set(key, [link])
  }

  for (const [source, sourceLinks] of bySource) {
    console.log(`  ${source}`)
    for (const link of sourceLinks) {
      console.log(term.dim(`    -> ${link.href}`), term.dim(`(${link.rel})`))
    }
  }
}

/**
 * Extract the internal name from a `km:name[#fragment]` href. Returns
 * null for external URIs, self-refs, or malformed input.
 */
function extractKmName(href: string): string | null {
  if (!href.startsWith("km:")) return null
  const rest = href.slice(3)
  const hashAt = rest.indexOf("#")
  const path = hashAt === -1 ? rest : rest.slice(0, hashAt)
  if (!path) return null
  // Decode percent-encoded reserved chars (`%23` → `#`, `%3F` → `?`, `%25` → `%`).
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}
