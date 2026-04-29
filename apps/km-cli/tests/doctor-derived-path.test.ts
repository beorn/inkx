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
  ).run(fixture.id, "h", fixture.parent_id ?? null, fixture.name ?? null, JSON.stringify(fixture.data ?? {}), now, now)
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

  // Test-fixture corpora carry hardcoded ULID `data.id` values intentionally
  // — they're synthetic artifacts, not real beads. By default `findPathDrift`
  // skips paths matching `**/fidelity-corpus/**`, `**/__fixtures__/**`, etc.
  // `--include-fixtures` opts back into scanning them.
  describe("fixture-path exclusion", () => {
    test("drifted bead inside fidelity-corpus → skipped by default", async () => {
      await withTestEnv(async ({ db }) => {
        // Build the parent chain: packages/km-markdown/tests/fidelity-corpus/large/kitchen-sink
        insertNode(db, { id: "packages", name: "packages" })
        insertNode(db, { id: "km-md", name: "km-markdown", parent_id: "packages" })
        insertNode(db, { id: "tests", name: "tests", parent_id: "km-md" })
        insertNode(db, { id: "corpus", name: "fidelity-corpus", parent_id: "tests" })
        insertNode(db, { id: "large", name: "large", parent_id: "corpus" })
        insertNode(db, {
          id: "packages/km-markdown/tests/fidelity-corpus/large/kitchen-sink",
          name: "kitchen-sink",
          parent_id: "large",
          // Hardcoded ULID — drifts vs derived parent path
          data: { id: "01HVQZ3MZYX0RNK8QKM7B1F4TF" },
        })

        expect(findPathDrift(db)).toEqual([])
      })
    })

    test("drifted bead inside fidelity-corpus → flagged with includeFixtures", async () => {
      await withTestEnv(async ({ db }) => {
        insertNode(db, { id: "packages", name: "packages" })
        insertNode(db, { id: "km-md", name: "km-markdown", parent_id: "packages" })
        insertNode(db, { id: "tests", name: "tests", parent_id: "km-md" })
        insertNode(db, { id: "corpus", name: "fidelity-corpus", parent_id: "tests" })
        insertNode(db, { id: "large", name: "large", parent_id: "corpus" })
        insertNode(db, {
          id: "packages/km-markdown/tests/fidelity-corpus/large/kitchen-sink",
          name: "kitchen-sink",
          parent_id: "large",
          data: { id: "01HVQZ3MZYX0RNK8QKM7B1F4TF" },
        })

        const findings = findPathDrift(db, { includeFixtures: true })
        expect(findings.length).toBe(1)
        expect(findings[0]!.declared).toBe("01HVQZ3MZYX0RNK8QKM7B1F4TF")
      })
    })

    test("non-fixture drift still surfaces by default", async () => {
      await withTestEnv(async ({ db }) => {
        insertNode(db, { id: "root", name: "@km" })
        insertNode(db, {
          id: "leaf",
          name: "actually-renamed",
          parent_id: "root",
          data: { id: "@km/old-name" },
        })

        const findings = findPathDrift(db)
        expect(findings.length).toBe(1)
        expect(findings[0]!.derived).toBe("@km/actually-renamed")
      })
    })

    test("fidelity-corpus bead with matching id is fine even when scanned", async () => {
      await withTestEnv(async ({ db }) => {
        insertNode(db, { id: "tests", name: "tests" })
        insertNode(db, { id: "corpus", name: "fidelity-corpus", parent_id: "tests" })
        insertNode(db, {
          id: "tests/fidelity-corpus/aligned",
          name: "aligned",
          parent_id: "corpus",
          data: { id: "tests/fidelity-corpus/aligned" },
        })

        expect(findPathDrift(db, { includeFixtures: true })).toEqual([])
      })
    })

    test("__fixtures__ segment also excluded by default", async () => {
      await withTestEnv(async ({ db }) => {
        insertNode(db, { id: "pkg", name: "pkg" })
        insertNode(db, { id: "fx", name: "__fixtures__", parent_id: "pkg" })
        insertNode(db, {
          id: "pkg/__fixtures__/sample",
          name: "sample",
          parent_id: "fx",
          data: { id: "01HXXXXXXXXXXXXXXXXXXXXXX1" },
        })

        expect(findPathDrift(db)).toEqual([])
        expect(findPathDrift(db, { includeFixtures: true })).toHaveLength(1)
      })
    })
  })
})
