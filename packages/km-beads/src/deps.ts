/**
 * Beads Dependency Management
 *
 * Add and remove dependencies between issues.
 */

import type { Repo } from "@km/storage"
import type { Issue } from "./types.ts"
import { nodeToIssue } from "./queries.ts"

/**
 * Add a dependency (blocked-by relationship)
 *
 * Returns updated data field for the node.
 */
export function addDependency(
  issue: Issue,
  dependsOn: string, // Short ID of the blocker
): { props: Record<string, unknown>; propsRaw: Record<string, string> } {
  const currentBlockers = issue.blockedBy || []

  // Don't add duplicate
  if (currentBlockers.includes(dependsOn)) {
    return buildBlockedByProps(currentBlockers)
  }

  const newBlockers = [...currentBlockers, dependsOn]
  return buildBlockedByProps(newBlockers)
}

/**
 * Remove a dependency
 */
export function removeDependency(
  issue: Issue,
  dependsOn: string,
): { props: Record<string, unknown>; propsRaw: Record<string, string> } | null {
  const currentBlockers = issue.blockedBy || []

  if (!currentBlockers.includes(dependsOn)) {
    return null // Not a current dependency
  }

  const newBlockers = currentBlockers.filter((b) => b !== dependsOn)

  if (newBlockers.length === 0) {
    // Return empty props to clear the blocked-by property
    return { props: {}, propsRaw: {} }
  }

  return buildBlockedByProps(newBlockers)
}

/**
 * Build the blocked-by property structure
 */
function buildBlockedByProps(blockers: string[]): {
  props: Record<string, unknown>
  propsRaw: Record<string, string>
} {
  if (blockers.length === 0) {
    return { props: {}, propsRaw: {} }
  }

  if (blockers.length === 1) {
    return {
      props: {
        "blocked-by": { type: "link", target: blockers[0] },
      },
      propsRaw: {
        "blocked-by": `[[${blockers[0]}]]`,
      },
    }
  }

  // Multiple blockers - use list type
  return {
    props: {
      "blocked-by": {
        type: "list",
        values: blockers.map((b) => ({ type: "link", target: b })),
      },
    },
    propsRaw: {
      "blocked-by": blockers.map((b) => `[[${b}]]`).join(", "),
    },
  }
}

/**
 * Get all dependencies for an issue.
 *
 * Returns the union of:
 *   - `issue.blockedBy` — props-based blockers from `blocked-by::` syntax
 *   - inbound `blocks::` wikilinks — when a passed-in repo is available,
 *     look up paragraphs whose content matches `blocks:: …[[<issue>]]…`
 *     and report each host file as a blocker. Closes the gap that the
 *     parser doesn't yet emit a typed `rel: "blocks"` taxonomy on the
 *     links table (tracked at @km/storage/link-rel-taxonomy).
 */
export function getDependencies(issue: Issue, repo?: Repo): string[] {
  const propsBased = issue.blockedBy ?? []
  if (!repo) return propsBased
  // Non-beads have no shortId, so no inbound `blocks::` link can name
  // them — only the props-based blockers apply.
  if (!issue.shortId) return propsBased

  // Find paragraphs whose content starts with `blocks::` and contains
  // a wikilink resolving to this issue. Match against the issue's
  // canonical id (path-form) and short id, both of which can appear
  // inside `[[...]]`.
  const idForms = [issue.shortId]
  const sql = `
    SELECT DISTINCT parent_id
    FROM nodes
    WHERE content LIKE 'blocks::%'
      AND parent_id IS NOT NULL
      AND (${idForms.map(() => "content LIKE ?").join(" OR ")})
  `
  // The wikilink can be `[[<id>]]`, `[[../slug]]`, or anchored — the
  // last path component is the most reliable substring to match on.
  const slug = issue.shortId.split("/").pop() ?? issue.shortId
  const params = idForms.map(() => `%${slug}%`)
  const rows = repo.rawQuery<{ parent_id: string }>(sql, params)

  const linkBased = rows
    .map((r) => repo.getNode(r.parent_id))
    .filter((n): n is NonNullable<typeof n> => n != null)
    .map((n) => nodeToIssue(n, { repo }).shortId)
    // Drop non-bead parents — they can't appear in a dependency list
    // because they have no canonical id to reference.
    .filter((sid): sid is string => sid !== undefined)

  // Union without duplicates, preserving order.
  return [...new Set([...propsBased, ...linkBased])]
}

/**
 * Check if issue A depends on issue B
 */
export function dependsOn(issueA: Issue, issueB: Issue): boolean {
  // A non-bead (no shortId) cannot be a dependency target.
  if (!issueB.shortId) return false
  return (issueA.blockedBy || []).includes(issueB.shortId)
}

/**
 * Merge dependency props into existing node data.
 *
 * Always replaces the `blocked-by` key's value with what depProps carries.
 * An empty `depProps.props` (from removing the last blocker) DROPS the
 * `blocked-by` key entirely — important so the serialized markdown no
 * longer renders `blocked-by:: [[...]]` and the reparse doesn't resurrect
 * the stale dependency.
 */
export function mergeDepProps(
  existingData: Record<string, unknown> | undefined,
  depProps: {
    props: Record<string, unknown>
    propsRaw: Record<string, string>
  },
): Record<string, unknown> {
  const data = existingData || {}
  const existingProps = { ...((data.props || {}) as Record<string, unknown>) }
  const existingPropsRaw = { ...((data.propsRaw || {}) as Record<string, string>) }

  // Remove blocked-by from both maps first — the depProps shape owns it.
  delete existingProps["blocked-by"]
  delete existingPropsRaw["blocked-by"]

  // Then layer in whatever depProps wants to assert (empty = deletion).
  const nextProps = { ...existingProps, ...depProps.props }
  const nextPropsRaw = { ...existingPropsRaw, ...depProps.propsRaw }

  return {
    ...data,
    props: nextProps,
    propsRaw: nextPropsRaw,
  }
}
