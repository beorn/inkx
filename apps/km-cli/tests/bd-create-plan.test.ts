/**
 * Pure-planner unit tests for `bd create` canonical-id resolution.
 *
 * Tracks `@km/cli/bd-create-dead-canonical-fallback` (Phase 2 of the
 * bd split). The legacy `legacy inline-addNode path` was deleted; every
 * supported `bd create` input shape now produces a non-null canonical
 * id, eliminating the silent-fallback escape hatch.
 *
 * The planner lives in `bd-create-plan.ts` — a pure module with zero
 * silvery imports, so this test file boots without booting commander or
 * the silvery import chain. Mirrors the chain-immunity pattern from
 * `tasks/*-plan.ts`.
 */

import { describe, expect, test } from "vitest"
import { resolveBdCreateCanonicalId } from "../src/commands/bd-create-plan.ts"

describe("resolveBdCreateCanonicalId — pure planner", () => {
  describe("case 1: fully-qualified path-form (`@<prefix>/scope/leaf`)", () => {
    test("returns the path-form id verbatim", () => {
      const id = resolveBdCreateCanonicalId({
        customId: "@km/beads/foo",
        explicitParent: undefined,
        parentCanonicalId: null,
        parentFsPathStripped: null,
        prefix: "km",
      })
      expect(id).toBe("@km/beads/foo")
    })

    test("multi-segment path is preserved", () => {
      const id = resolveBdCreateCanonicalId({
        customId: "@km/wt/agent/sub-task",
        explicitParent: undefined,
        parentCanonicalId: null,
        parentFsPathStripped: null,
        prefix: "km",
      })
      expect(id).toBe("@km/wt/agent/sub-task")
    })
  })

  describe("case 2: foreign sigil with slash (`@otherprefix/scope/leaf`)", () => {
    test("passes through unchanged", () => {
      const id = resolveBdCreateCanonicalId({
        customId: "@pim/inbox/foo",
        explicitParent: undefined,
        parentCanonicalId: null,
        parentFsPathStripped: null,
        prefix: "km",
      })
      expect(id).toBe("@pim/inbox/foo")
    })
  })

  describe("case 3: bd-form (`<prefix>-scope.leaf`)", () => {
    test("translates km-beads.foo → @km/beads/foo", () => {
      const id = resolveBdCreateCanonicalId({
        customId: "km-beads.foo",
        explicitParent: undefined,
        parentCanonicalId: null,
        parentFsPathStripped: null,
        prefix: "km",
      })
      expect(id).toBe("@km/beads/foo")
    })

    test("dotted multi-segment translates to slash-separated path", () => {
      const id = resolveBdCreateCanonicalId({
        customId: "km-wt.agent.sub",
        explicitParent: undefined,
        parentCanonicalId: null,
        parentFsPathStripped: null,
        prefix: "km",
      })
      expect(id).toBe("@km/wt/agent/sub")
    })

    test("custom prefix routes correctly", () => {
      const id = resolveBdCreateCanonicalId({
        customId: "pim-beads.foo",
        explicitParent: undefined,
        parentCanonicalId: null,
        parentFsPathStripped: null,
        prefix: "pim",
      })
      expect(id).toBe("@pim/beads/foo")
    })
  })

  describe("case 4: split form (--parent X --id leaf)", () => {
    test("uses parent's canonical id when available", () => {
      const id = resolveBdCreateCanonicalId({
        customId: "leaf",
        explicitParent: "km-beads",
        parentCanonicalId: "@km/beads",
        parentFsPathStripped: null,
        prefix: "km",
      })
      expect(id).toBe("@km/beads/leaf")
    })

    test("falls back to fs_path when canonical id is missing", () => {
      const id = resolveBdCreateCanonicalId({
        customId: "leaf",
        explicitParent: "km-beads",
        parentCanonicalId: null,
        parentFsPathStripped: "@km/beads",
        prefix: "km",
      })
      expect(id).toBe("@km/beads/leaf")
    })

    test("prepends sigil when fs_path is bare", () => {
      const id = resolveBdCreateCanonicalId({
        customId: "leaf",
        explicitParent: "km-beads",
        parentCanonicalId: null,
        parentFsPathStripped: "beads",
        prefix: "km",
      })
      expect(id).toBe("@km/beads/leaf")
    })

    test("preserves fs_path that already starts with @ (foreign)", () => {
      const id = resolveBdCreateCanonicalId({
        customId: "leaf",
        explicitParent: "@pim/beads",
        parentCanonicalId: null,
        parentFsPathStripped: "@pim/beads",
        prefix: "km",
      })
      expect(id).toBe("@pim/beads/leaf")
    })
  })

  describe("case 5: bare leaf id without --parent → inbox", () => {
    test("`q5hji` lands at @km/inbox/q5hji", () => {
      const id = resolveBdCreateCanonicalId({
        customId: "q5hji",
        explicitParent: undefined,
        parentCanonicalId: null,
        parentFsPathStripped: null,
        prefix: "km",
      })
      expect(id).toBe("@km/inbox/q5hji")
    })

    test("custom prefix routes to its own inbox", () => {
      const id = resolveBdCreateCanonicalId({
        customId: "q5hji",
        explicitParent: undefined,
        parentCanonicalId: null,
        parentFsPathStripped: null,
        prefix: "pim",
      })
      expect(id).toBe("@pim/inbox/q5hji")
    })
  })

  describe("case 6 (Phase 2 — was the dead fallback): unusual ids without parent/sigil", () => {
    test("`foo.bar` (used to fall through) now lands in inbox with literal leaf preserved", () => {
      // Pre-Phase-2: this returned null and bd.ts dropped to the legacy
      // inline-addNode path. Post-Phase-2: routes to inbox with the
      // literal leaf preserved. The user sees their typed id as the
      // file under inbox/.
      const id = resolveBdCreateCanonicalId({
        customId: "foo.bar",
        explicitParent: undefined,
        parentCanonicalId: null,
        parentFsPathStripped: null,
        prefix: "km",
      })
      expect(id).toBe("@km/inbox/foo.bar")
    })

    test("`foo/bar` (used to fall through) now lands in inbox with literal leaf preserved", () => {
      const id = resolveBdCreateCanonicalId({
        customId: "foo/bar",
        explicitParent: undefined,
        parentCanonicalId: null,
        parentFsPathStripped: null,
        prefix: "km",
      })
      expect(id).toBe("@km/inbox/foo/bar")
    })

    test("split form with unresolvable parent path falls through to inbox routing", () => {
      // Edge case: user passed --parent but neither parentCanonicalId
      // nor parentFsPathStripped resolved. Phase-1 behaviour was a null
      // return; Phase-2 routes the leaf to inbox so the bead always
      // materializes somewhere predictable.
      const id = resolveBdCreateCanonicalId({
        customId: "leaf",
        explicitParent: "missing",
        parentCanonicalId: null,
        parentFsPathStripped: null,
        prefix: "km",
      })
      expect(id).toBe("@km/inbox/leaf")
    })
  })

  describe("L4 invariant: every supported input shape produces a non-null id", () => {
    // Property-style coverage of the matrix. If a future refactor
    // reintroduces a null return, this test catches it.
    const cases = [
      { customId: "@km/scope/foo", explicitParent: undefined },
      { customId: "@pim/scope/foo", explicitParent: undefined },
      { customId: "km-scope.foo", explicitParent: undefined },
      { customId: "leaf", explicitParent: undefined },
      { customId: "leaf", explicitParent: "km-scope" },
      { customId: "foo.bar", explicitParent: undefined },
      { customId: "foo/bar", explicitParent: undefined },
      { customId: "leaf-with-dashes", explicitParent: undefined },
    ]

    for (const c of cases) {
      test(`customId=${JSON.stringify(c.customId)} parent=${JSON.stringify(c.explicitParent)} → non-empty id`, () => {
        const id = resolveBdCreateCanonicalId({
          customId: c.customId,
          explicitParent: c.explicitParent,
          parentCanonicalId: c.explicitParent ? "@km/scope" : null,
          parentFsPathStripped: null,
          prefix: "km",
        })
        expect(typeof id).toBe("string")
        expect(id.length).toBeGreaterThan(0)
        // Every result is a path-form id under some sigil.
        expect(id.startsWith("@")).toBe(true)
        expect(id.includes("/")).toBe(true)
      })
    }
  })
})
