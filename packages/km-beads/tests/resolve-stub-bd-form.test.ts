/**
 * Resolve bd-form aliases on stub-state nodes.
 *
 * Scenario: a freshly-created `.md` file lands on disk via `bd create`, but
 * its frontmatter hasn't been parsed into `data.aliases` yet. The
 * `node_aliases` table — populated by the schema-v9 trigger from
 * `data.aliases` — is empty for that node, so step 3 of `resolveRef`
 * misses. Step 2 (path-form lookup via `repo.resolveNode`) only fires when
 * the input contains `/`. The bd-form `km-beads.foo` contains no `/`, so it
 * falls all the way through to `null` — even though the file exists at
 * `@km/beads/foo.md` and is reachable by path.
 *
 * The fix: when bd-form input fails the alias arm, derive the path-form
 * via `bdIdToPathForm` and retry the path-shaped resolution.
 *
 * Bead: implicit (covered by Bug 2 in the bd-fixer fix-up session).
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"

import { resolveShortId } from "../src/short-ids.ts"

describe("resolveShortId — bd-form input on stub-state nodes", () => {
  test("bd-form (km-beads.foo) resolves to a stub at @km/beads/foo.md", () => {
    using repo = createTestRepo()
    // Seed only what a freshly-created file looks like in stub state:
    // fs_path is set, data.aliases / data.id are NOT populated yet.
    const stubId = repo.addNode(null, {
      type: "p",
      content: "",
      fs_path: "@km/beads/foo.md",
      data: { _stub: true },
    })

    // Without the bd-form-to-path-form fallback, this returns null.
    const resolved = resolveShortId("km-beads.foo", { repo })
    expect(resolved).toBe(stubId)
  })

  test("bd-form with multi-segment scope (km-silvercode.acp.rename) resolves to stub", () => {
    using repo = createTestRepo()
    const stubId = repo.addNode(null, {
      type: "p",
      content: "",
      fs_path: "@km/silvercode/acp/rename.md",
      data: { _stub: true },
    })

    const resolved = resolveShortId("km-silvercode.acp.rename", { repo })
    expect(resolved).toBe(stubId)
  })

  test("dash-form (km-beads-foo) also resolves on stub-state", () => {
    using repo = createTestRepo()
    const stubId = repo.addNode(null, {
      type: "p",
      content: "",
      fs_path: "@km/beads/foo.md",
      data: { _stub: true },
    })

    const resolved = resolveShortId("km-beads-foo", { repo })
    expect(resolved).toBe(stubId)
  })

  test("non-existent bd-form returns null (no false positives)", () => {
    using repo = createTestRepo()

    const resolved = resolveShortId("km-nonexistent.thing", { repo })
    expect(resolved).toBeNull()
  })

  test("bd-form auto-id without dot (km-q5hji) routes to inbox stub", () => {
    using repo = createTestRepo()
    const stubId = repo.addNode(null, {
      type: "p",
      content: "",
      fs_path: "@km/inbox/q5hji.md",
      data: { _stub: true },
    })

    const resolved = resolveShortId("km-q5hji", { repo })
    expect(resolved).toBe(stubId)
  })
})
