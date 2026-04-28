/**
 * Migrate helpers — slug-augmentation for numeric-leaf bd ids.
 *
 * bd auto-numbers sub-ids when callers don't supply a custom suffix
 * (`km-rev-code-0203.1`, `.2`, …); the bare numeric leaf is unhelpful
 * as a filename or card label after migration. These tests pin the
 * augmentation behavior + the parent-path exemption.
 */

import { describe, it, expect } from "vitest"
import {
  bdIdToPathForm,
  bdIdToPathFormWithSlug,
  bdIdToAliases,
  buildIdMap,
  rewriteLegacyIdMentions,
} from "../src/migrate.ts"
import type { BeadsIssue } from "../src/schema.ts"

function fakeIssue(id: string, title: string, overrides: Partial<BeadsIssue> = {}): BeadsIssue {
  return {
    id,
    title,
    description: "",
    status: "open",
    priority: 2,
    issue_type: "task",
    created_at: "2026-04-28T00:00:00Z",
    ...overrides,
  } as BeadsIssue
}

describe("bdIdToPathFormWithSlug", () => {
  it("augments numeric leaf with title-derived slug", () => {
    expect(bdIdToPathFormWithSlug("km-rev-code-0203.1", "Add keyboard nav")).toBe("rev-code-0203/1-add-keyboard-nav")
  })

  it("leaves non-numeric leaves untouched", () => {
    expect(bdIdToPathFormWithSlug("km-silvercode.acp.rename", "ACP rename")).toBe("silvercode/acp/rename")
  })

  it("falls back to base path-form when slug is empty (title is all symbols)", () => {
    expect(bdIdToPathFormWithSlug("km-foo.1", "...")).toBe("foo/1")
  })

  it("returns null for empty stripped id", () => {
    expect(bdIdToPathFormWithSlug("km-", "anything")).toBeNull()
  })
})

describe("buildIdMap", () => {
  it("augments leaf-only numeric ids", () => {
    const map = buildIdMap([
      fakeIssue("km-rev-code-0203.1", "Remove ensureOpen anti-pattern"),
      fakeIssue("km-rev-code-0203.2", "Convert getters to plain properties"),
    ])
    expect(map.get("km-rev-code-0203.1")).toBe("rev-code-0203/1-remove-ensureopen-anti-pattern")
    expect(map.get("km-rev-code-0203.2")).toBe("rev-code-0203/2-convert-getters-to-plain-properties")
  })

  it("skips augmenting when the id is also a parent of other ids", () => {
    // km-silvery.1 is BOTH a leaf issue AND a parent of km-silvery.1.foo;
    // augmenting it would break the directory path the child file lives under.
    const map = buildIdMap([
      fakeIssue("km-silvery.1", "Interactive node signals"),
      fakeIssue("km-silvery.1.foo", "Sub issue"),
    ])
    expect(map.has("km-silvery.1")).toBe(false)
    expect(map.has("km-silvery.1.foo")).toBe(false)
  })

  it("does not augment non-numeric leaves", () => {
    const map = buildIdMap([fakeIssue("km-silvercode.acp.rename", "Rename ACP components")])
    expect(map.has("km-silvercode.acp.rename")).toBe(false)
  })
})

describe("bdIdToAliases", () => {
  it("includes bd-form, dash variant, and the bare path-form when slug-augmented", () => {
    const aliases = bdIdToAliases("km-rev-code-0203.1", "rev-code-0203/1")
    expect(aliases).toContain("km-rev-code-0203.1")
    expect(aliases).toContain("km-rev-code-0203-1")
    expect(aliases).toContain("rev-code-0203/1")
  })

  it("omits extra path-form when not provided (non-augmented issue)", () => {
    const aliases = bdIdToAliases("km-silvercode.acp")
    expect(aliases).toEqual(["km-silvercode.acp", "km-silvercode-acp"])
  })
})

describe("rewriteLegacyIdMentions", () => {
  it("rewrites bd-form mentions to slug-augmented path when idMap provides one", () => {
    const idMap = new Map([["km-rev-code-0203.1", "rev-code-0203/1-remove-ensureopen"]])
    const out = rewriteLegacyIdMentions("See km-rev-code-0203.1 for details.", "km", idMap)
    expect(out).toBe("See @km/rev-code-0203/1-remove-ensureopen for details.")
  })

  it("falls back to bare path-form when idMap has no entry", () => {
    const out = rewriteLegacyIdMentions("See km-foo.bar for details.", "km")
    expect(out).toBe("See @km/foo/bar for details.")
  })
})

describe("bdIdToPathForm", () => {
  it("strips prefix and converts dots to slashes", () => {
    expect(bdIdToPathForm("km-silvercode.acp.rename")).toBe("silvercode/acp/rename")
  })

  it("parks orphan ids under _orphan/", () => {
    expect(bdIdToPathForm("km-q5hji")).toBe("_orphan/q5hji")
  })
})
