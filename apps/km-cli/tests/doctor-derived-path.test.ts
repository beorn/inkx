/**
 * Doctor: data.id vs derived parent-path drift check
 *
 * Soft sanity check that surfaces when a bead's frontmatter `id` no longer
 * matches the path you'd derive by walking the parent chain. Drift means
 * the file was likely moved or renamed without updating frontmatter.
 */

import { describe, test, expect } from "vitest"
import { withTestEnv } from "@km/storage"
import type { Database } from "bun:sqlite"

import { findPathDrift, countPathDriftCheckable } from "../src/commands/doctor-paths-check.ts"

interface NodeFixture {
  id: string
  name?: string | null
  parent_id?: string | null
  data?: Record<string, unknown>
}

function insertNode(db: Database, fixture: NodeFixture): void {
  const now = Date.now()
  db.prepare(
    `INSERT INTO nodes (id, type, parent_id, name, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    fixture.id,
    "h",
    fixture.parent_id ?? null,
    fixture.name ?? null,
    JSON.stringify(fixture.data ?? {}),
    now,
    now,
  )
}

describe.sequential("doctor paths drift check", () => {
  test("bead with no data.id → not counted, no warning", async () => {
    await withTestEnv(async ({ db }) => {
      insertNode(db, { id: "n1", name: "@km" })
      insertNode(db, { id: "n2", name: "beads", parent_id: "n1" })
      // No data.id on n2.

      expect(countPathDriftCheckable(db)).toBe(0)
      expect(findPathDrift(db)).toEqual([])
    })
  })

  test("bead with matching data.id → no warning", async () => {
    await withTestEnv(async ({ db }) => {
      insertNode(db, { id: "root", name: "@km" })
      insertNode(db, {
        id: "leaf",
        name: "cutover",
        parent_id: "root",
        data: { id: "@km/cutover" },
      })

      expect(countPathDriftCheckable(db)).toBe(1)
      expect(findPathDrift(db)).toEqual([])
    })
  })

  test("bead with non-matching data.id → one warning with both values", async () => {
    await withTestEnv(async ({ db }) => {
      insertNode(db, { id: "root", name: "@km" })
      insertNode(db, {
        id: "leaf",
        name: "renamed-on-disk",
        parent_id: "root",
        data: { id: "@km/old-name" },
      })

      const findings = findPathDrift(db)
      expect(findings.length).toBe(1)
      expect(findings[0]!.nodeId).toBe("leaf")
      expect(findings[0]!.declared).toBe("@km/old-name")
      expect(findings[0]!.derived).toBe("@km/renamed-on-disk")
    })
  })

  test("multi-bead vault: count summary correct", async () => {
    await withTestEnv(async ({ db }) => {
      insertNode(db, { id: "root", name: "@km" })
      insertNode(db, { id: "scope", name: "beads", parent_id: "root" })

      // matches
      insertNode(db, {
        id: "ok1",
        name: "alpha",
        parent_id: "scope",
        data: { id: "@km/beads/alpha" },
      })
      insertNode(db, {
        id: "ok2",
        name: "beta",
        parent_id: "scope",
        data: { id: "@km/beads/beta" },
      })

      // drifted
      insertNode(db, {
        id: "drift1",
        name: "gamma",
        parent_id: "scope",
        data: { id: "@km/beads/gamma-old" },
      })
      insertNode(db, {
        id: "drift2",
        name: "delta",
        parent_id: "scope",
        data: { id: "@km/some-other-place/delta" },
      })

      // no data.id — excluded
      insertNode(db, { id: "skip1", name: "epsilon", parent_id: "scope" })

      expect(countPathDriftCheckable(db)).toBe(4)
      const findings = findPathDrift(db)
      expect(findings.length).toBe(2)
      expect(findings.map((f) => f.nodeId).sort()).toEqual(["drift1", "drift2"])
    })
  })

  test("deeply nested bead → derived path joins all ancestors", async () => {
    await withTestEnv(async ({ db }) => {
      insertNode(db, { id: "a", name: "@km" })
      insertNode(db, { id: "b", name: "scope", parent_id: "a" })
      insertNode(db, { id: "c", name: "sub", parent_id: "b" })
      insertNode(db, {
        id: "d",
        name: "leaf",
        parent_id: "c",
        data: { id: "@km/scope/sub/leaf" },
      })

      expect(findPathDrift(db)).toEqual([])
    })
  })

  test("root node with data.id and matching name → no warning", async () => {
    await withTestEnv(async ({ db }) => {
      insertNode(db, { id: "only", name: "@km", data: { id: "@km" } })
      expect(findPathDrift(db)).toEqual([])
    })
  })
})
