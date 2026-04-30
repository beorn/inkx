/**
 * Bead data-schema tests.
 *
 * Covers:
 *   - Every known frontmatter / inline-property shape passes parseBeadData
 *   - Unknown extras (parser internals like _mdSource, foreign keys)
 *     pass through verbatim — markdown round-trip stays lossless
 *   - Wrong-shape values surface as warnings on the read path (no throw)
 *   - assertBeadDataPatch rejects bad shapes on the write path
 *   - Empty / null / undefined input is safe
 *
 * Bead: km-beads.data-schema-plateau.
 */

import { describe, test, expect } from "vitest"
import {
  beadDataSchema,
  parseBeadData,
  assertBeadDataPatch,
  BeadDataValidationError,
} from "../src/data-schema.ts"

describe("beadDataSchema", () => {
  test("validates a real file-bead frontmatter shape (cutover.md)", () => {
    // Captured verbatim from @km/beads/cutover.md frontmatter on 2026-04-29.
    const data = {
      tags: ["task", "P1"],
      mentions: ["km", "claude"],
      id: "@km/beads/cutover",
      aliases: ["km-beads.cutover", "km-beads-cutover"],
      created_by: "claude:da9990c5",
      created_at: "2026-04-27T22:03:05Z",
      closeReason: "Phase A+B+C complete: bd→km bd skill rewrite",
      started_at: "2026-04-27T22:03:34Z",
      owner: "bjorn@stabell.org",
      assignee: "claude:da9990c5",
      dependencies: [
        {
          issue_id: "km-beads.cutover",
          depends_on_id: "km-beads",
          type: "parent-child",
          created_at: "2026-04-27T15:03:33Z",
          created_by: "claude:da9990c5",
          metadata: "{}",
        },
      ],
    }
    const result = beadDataSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test("validates a minimal scope-epic frontmatter shape", () => {
    // Captured from @km/storage.md — typical scope-epic frontmatter:
    // just id + aliases + created_at.
    const data = {
      id: "@km/storage",
      aliases: ["km-storage", "@km/_orphan/storage"],
      created_at: "2026-02-04T11:50:23Z",
    }
    const result = beadDataSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test("validates a closed-bead frontmatter with close_reason and dependencies", () => {
    // Captured from @km/beads/dep-graph.md.
    const data = {
      id: "@km/beads/dep-graph",
      aliases: ["km-beads.dep-graph", "km-beads-dep-graph"],
      created_by: "claude:da9990c5",
      created_at: "2026-04-28T00:10:38Z",
      closed_at: "2026-04-28T02:53:42Z",
      close_reason: "Shipped in commit ede04bd5a alongside path-ids",
      owner: "bjorn@stabell.org",
      dependencies: [
        {
          issue_id: "km-beads.dep-graph",
          depends_on_id: "km-beads",
          type: "parent-child",
          created_at: "2026-04-27T17:10:48Z",
          created_by: "claude:da9990c5",
          metadata: "{}",
        },
        {
          issue_id: "km-beads.dep-graph",
          depends_on_id: "km-beads.cutover",
          type: "blocks",
          created_at: "2026-04-27T17:10:48Z",
          created_by: "claude:da9990c5",
          metadata: "{}",
        },
      ],
    }
    const result = beadDataSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test("validates inline-bead props (single blocked-by link)", () => {
    // Inline beads use Logseq-style `<key>:: <value>` properties parsed
    // into `data.props` + `data.propsRaw`. Single link = `type:"link"`.
    const data = {
      props: {
        "blocked-by": { type: "link", target: "km-tui.cursor-jitter" },
      },
      propsRaw: {
        "blocked-by": "[[km-tui.cursor-jitter]]",
      },
    }
    const result = beadDataSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test("validates inline-bead props (list of blocked-by links)", () => {
    // Multi-blocker shape — `type:"list"` with values[].target.
    const data = {
      props: {
        "blocked-by": {
          type: "list",
          values: [
            { type: "link", target: "km-a" },
            { type: "link", target: "km-b" },
          ],
        },
      },
      propsRaw: {
        "blocked-by": "[[km-a]], [[km-b]]",
      },
    }
    const result = beadDataSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test("validates a free-form prop value (`due:: 2026-05-01`)", () => {
    const data = {
      props: {
        due: { type: "date", value: "2026-05-01" },
      },
      propsRaw: {
        due: "2026-05-01",
      },
    }
    const result = beadDataSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test("validates the post-create newly-authored bead shape", () => {
    // Captured from mutations.createBeadNode — what km-beads writes
    // when `bd create` lands.
    const data = {
      short_id: "km-abc1",
      tags: ["bug", "P0"],
      mentions: [],
    }
    const result = beadDataSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test("validates the post-close shape (closeReason layered onto existing data)", () => {
    // Captured from mutations.closeBeadFields — merges closeReason onto
    // the existing data blob.
    const data = {
      id: "@km/beads/foo",
      aliases: ["km-beads.foo"],
      short_id: "km-foo1",
      tags: ["task", "P2"],
      mentions: ["km"],
      closeReason: "Shipped in 12345abc",
    }
    const result = beadDataSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test("validates the post-drop shape (dropReason)", () => {
    const data = {
      id: "@km/beads/foo",
      short_id: "km-foo1",
      dropReason: "Superseded by km-beads.bar",
    }
    const result = beadDataSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test("validates a deferred-bead shape", () => {
    const data = {
      id: "@km/beads/foo",
      short_id: "km-foo1",
      defer_until: "2026-06-01",
      work_type: "mutex",
    }
    const result = beadDataSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

describe("beadDataSchema — passthrough behavior", () => {
  test("preserves unknown frontmatter keys verbatim", () => {
    // Foreign frontmatter (non-bead consumers) must round-trip — we
    // can't drop keys we don't recognize or the markdown round-trip
    // breaks for everyone else.
    const data = {
      id: "@km/beads/foo",
      "custom-field": { nested: "value" },
      anotherField: 42,
      author: "someone",
    }
    const parsed = beadDataSchema.parse(data)
    expect(parsed).toMatchObject({
      "custom-field": { nested: "value" },
      anotherField: 42,
      author: "someone",
    })
  })

  test("preserves parser internals (_mdSource, _mdBullet, _allTags, _stub)", () => {
    // km-markdown writes underscore-prefixed internals onto data; they
    // must survive an unrelated bead update or markdown can't reserialize.
    const data = {
      _mdSource: "**bold** text",
      _mdSourceContent: "**bold** text",
      _mdBullet: "-",
      _allTags: ["foo", "bar"],
      _stub: true,
    }
    const parsed = beadDataSchema.parse(data)
    expect(parsed).toMatchObject({
      _mdSource: "**bold** text",
      _mdBullet: "-",
      _stub: true,
    })
  })

  test("preserves rrule / lang / metadata / list_start", () => {
    // Recurrence + code-block + numbered-list metadata that lives in
    // data but isn't bead-shaped.
    const data = {
      id: "@km/beads/foo",
      rrule: "FREQ=WEEKLY;BYDAY=MO",
      lang: "typescript",
      meta: "title=foo.ts",
      list_start: 5,
    }
    const parsed = beadDataSchema.parse(data)
    expect(parsed).toMatchObject({ rrule: "FREQ=WEEKLY;BYDAY=MO", lang: "typescript", list_start: 5 })
  })
})

describe("parseBeadData", () => {
  test("returns warnings (not errors) for wrong-shape known keys", () => {
    // `aliases` should be string[]; passing a number triggers a warning
    // but parseBeadData still returns the input data so callers don't
    // lose unrelated fields.
    const result = parseBeadData({
      id: "@km/beads/foo",
      aliases: 42, // wrong shape
      tags: ["P0"],
    })
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some((w) => w.path === "aliases")).toBe(true)
    // Original data is preserved.
    expect(result.data.id).toBe("@km/beads/foo")
    expect(result.data.tags).toEqual(["P0"])
  })

  test("never throws on undefined input", () => {
    expect(() => parseBeadData(undefined)).not.toThrow()
    const result = parseBeadData(undefined)
    expect(result.warnings).toHaveLength(0)
    expect(result.data).toEqual({})
  })

  test("never throws on null input", () => {
    expect(() => parseBeadData(null)).not.toThrow()
    const result = parseBeadData(null)
    expect(result.warnings).toHaveLength(0)
  })

  test("returns no warnings for a valid empty object", () => {
    const result = parseBeadData({})
    expect(result.warnings).toHaveLength(0)
  })

  test("returns warnings keyed by dotted path", () => {
    // Wrong shape inside props['blocked-by'].target (should be string).
    const result = parseBeadData({
      props: {
        "blocked-by": { type: "link", target: 12345 },
      },
    })
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings.some((w) => w.path.includes("blocked-by"))).toBe(true)
  })

  test("real frontmatter from cutover.md emits zero warnings", () => {
    // Regression pin — the canonical real-world shape MUST not warn.
    const result = parseBeadData({
      tags: ["task", "P1"],
      mentions: ["km", "claude"],
      id: "@km/beads/cutover",
      aliases: ["km-beads.cutover", "km-beads-cutover"],
      created_by: "claude:da9990c5",
      created_at: "2026-04-27T22:03:05Z",
      closeReason: "Phase A+B+C complete",
      started_at: "2026-04-27T22:03:34Z",
      owner: "bjorn@stabell.org",
      assignee: "claude:da9990c5",
      dependencies: [
        {
          issue_id: "km-beads.cutover",
          depends_on_id: "km-beads",
          type: "parent-child",
          created_at: "2026-04-27T15:03:33Z",
          created_by: "claude:da9990c5",
          metadata: "{}",
        },
      ],
    })
    expect(result.warnings).toEqual([])
  })
})

describe("assertBeadDataPatch", () => {
  test("accepts a valid patch", () => {
    expect(() =>
      assertBeadDataPatch({
        closeReason: "shipped",
      }),
    ).not.toThrow()
  })

  test("accepts a patch with passthrough keys", () => {
    expect(() =>
      assertBeadDataPatch({
        id: "@km/beads/foo",
        "custom-extra": "ok",
      }),
    ).not.toThrow()
  })

  test("rejects a patch with wrong-shape known key", () => {
    expect(() =>
      assertBeadDataPatch({
        aliases: "not-an-array", // wrong
      }),
    ).toThrowError(BeadDataValidationError)
  })

  test("rejects a patch with malformed dependencies entry", () => {
    expect(() =>
      assertBeadDataPatch({
        dependencies: [{ issue_id: "x" /* missing depends_on_id */ }],
      }),
    ).toThrowError(BeadDataValidationError)
  })

  test("error message lists offending paths", () => {
    try {
      assertBeadDataPatch({
        aliases: 42,
        tags: "wrong",
      })
      throw new Error("expected throw")
    } catch (e) {
      expect(e).toBeInstanceOf(BeadDataValidationError)
      const err = e as BeadDataValidationError
      expect(err.message).toContain("aliases")
      expect(err.message).toContain("tags")
    }
  })
})
