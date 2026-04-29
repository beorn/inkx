/**
 * nodeToIssue shortId resolution tests — km-beads.purge-fallback-id-l5
 *
 * After the bead-sigil-elevation predicate landed (km-beads.bead-sigil-
 * elevation @ 18efb7abd), nodes reaching `nodeToIssue` from queryReady /
 * queryIssues are guaranteed beads (depth-2 fs_path under boardRoots OR
 * `+` sigil prefix on name). Real beads always carry frontmatter `id:`
 * (canonical path-form) or legacy `data.short_id` (bd-form).
 *
 * The third-arm ULID-tail fallback (`km-${node.id.slice(-4)}`) used to
 * silently synthesize a short id for sub-checkbox descendants that
 * leaked through the predicate. With the predicate in place, that arm
 * is dead in the queryReady/queryIssues paths — and bypass paths
 * (`bd children`, `bd query`, path-resolved nodes) deserve an honest
 * `undefined` rather than a fabricated id, so consumers can distinguish
 * real beads from generic nodes.
 *
 * Invariant after this change:
 *   shortId === data.id              (when present, canonical path-form)
 *   shortId === data.short_id        (when present, legacy bd-form)
 *   shortId === undefined            (otherwise — caller must handle)
 *
 * No silent ULID-tail synthesis.
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import { nodeToIssue } from "../src/queries.ts"

describe("nodeToIssue.shortId — no ULID-tail fallback", () => {
  test("uses data.id when present (canonical path-form)", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "Real bead",
      fs_path: "@km/scope/real.md",
      data: { id: "@km/scope/real" },
    })
    const node = repo.getNode(id)
    expect(node).toBeDefined()
    if (!node) return
    const issue = nodeToIssue(node, { repo })
    expect(issue.shortId).toBe("@km/scope/real")
  })

  test("uses data.short_id when no data.id (legacy bd-form)", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "Legacy bead",
      fs_path: "@km/scope/legacy.md",
      data: { short_id: "km-abc1" },
    })
    const node = repo.getNode(id)
    if (!node) return
    const issue = nodeToIssue(node, { repo })
    expect(issue.shortId).toBe("km-abc1")
  })

  test("data.id wins over data.short_id when both present", () => {
    const repo = createTestRepo()
    const id = repo.addNode(null, {
      type: "p",
      content: "Migrated bead",
      fs_path: "@km/scope/migrated.md",
      data: { id: "@km/scope/migrated", short_id: "km-z9z9" },
    })
    const node = repo.getNode(id)
    if (!node) return
    const issue = nodeToIssue(node, { repo })
    expect(issue.shortId).toBe("@km/scope/migrated")
  })

  test("returns undefined when neither data.id nor data.short_id present (no ULID synthesis)", () => {
    const repo = createTestRepo()
    // Sub-checkbox style node — no data.id, no data.short_id.
    // Pre-purge, this would synthesize `km-${id.slice(-4)}`.
    // Post-purge, shortId is undefined (honest).
    const id = repo.addNode(null, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "Sub-checkbox without id",
    })
    const node = repo.getNode(id)
    if (!node) return
    const issue = nodeToIssue(node, { repo })
    expect(issue.shortId).toBeUndefined()
  })

  test("does NOT synthesize from node.id even when node.id ends in 4 hex chars", () => {
    const repo = createTestRepo()
    // Even if the node id naturally ends in 4 hex chars (which is the
    // shape the dead third arm would have grabbed), we MUST NOT emit a
    // `km-XXXX` short id when the node carries no real bead identity.
    const id = repo.addNode(null, {
      type: "p",
      content: "Anonymous descendant",
    })
    const node = repo.getNode(id)
    if (!node) return
    const issue = nodeToIssue(node, { repo })
    expect(issue.shortId).toBeUndefined()
    // Sanity: even a node.id like 01KQABCD has a 4-char suffix.
    expect(node.id.length).toBeGreaterThanOrEqual(4)
  })
})
