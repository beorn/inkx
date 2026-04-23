import type { LogRow } from "@km/logview/view-config"

/**
 * Chat-item clustering.
 *
 * v0 rule: adjacent rows of kind "hook" collapse to a single cluster when
 * there are >=2 of them. A single hook stays a plain row (no cluster chrome).
 * Hook failures (`hook_fail`) are intentionally NOT clustered — they're
 * louder and should stay individually visible.
 *
 * Expanded clusters render all their children in place. The cursor still
 * points at the cluster row — expanding is a purely visual operation on the
 * cluster's own render; cursor movement remains per-ChatItem, not per-child.
 * (Rationale: users can hit Enter on the cluster to open a detail overlay
 * listing all N hooks. Navigating through each hook individually is v1 if
 * users actually ask for it.)
 *
 * Returns a stable-keyed array of ChatItems.
 */

export type ChatItem =
  | { kind: "row"; id: string; row: LogRow }
  | { kind: "cluster"; id: string; clusterKind: "hook"; rows: LogRow[] }

const CLUSTER_MIN = 2

export function clusterRows(rows: LogRow[]): ChatItem[] {
  const out: ChatItem[] = []
  let i = 0
  while (i < rows.length) {
    const row = rows[i]!
    if (row.kind === "hook") {
      // Scan run of adjacent hooks.
      let j = i + 1
      while (j < rows.length && rows[j]!.kind === "hook") j++
      const run = rows.slice(i, j)
      if (run.length >= CLUSTER_MIN) {
        out.push({
          kind: "cluster",
          id: `cluster:${run[0]!.id}..${run[run.length - 1]!.id}`,
          clusterKind: "hook",
          rows: run,
        })
      } else {
        // Single hook — render as a plain row.
        out.push({ kind: "row", id: run[0]!.id, row: run[0]! })
      }
      i = j
      continue
    }
    out.push({ kind: "row", id: row.id, row })
    i++
  }
  return out
}
