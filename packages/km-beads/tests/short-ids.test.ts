import { describe, test, expect } from "vitest"
import { mintBeadName, normalizeBdRef, mintSubBeadName } from "../src/short-ids.ts"

describe("Bead name minters and bd-form normalizer", () => {
  test("mintBeadName produces <prefix>-xxxx format", () => {
    expect(mintBeadName("km")).toMatch(/^km-[a-z0-9]{4}$/)
    expect(mintBeadName("pim")).toMatch(/^pim-[a-z0-9]{4}$/)
  })

  test("normalizeBdRef adds prefix", () => {
    expect(normalizeBdRef("auth-epic", "km")).toBe("km-auth-epic")
  })

  test("normalizeBdRef is idempotent on already-prefixed ids (regression: km-beads.create-double-prefix)", () => {
    expect(normalizeBdRef("km-beads.foo", "km")).toBe("km-beads.foo")
    expect(normalizeBdRef("km-silvercode.acp.rename", "km")).toBe("km-silvercode.acp.rename")
  })

  test("normalizeBdRef converts path-form to bd-form", () => {
    expect(normalizeBdRef("beads/foo", "km")).toBe("km-beads.foo")
    expect(normalizeBdRef("silvercode/acp/rename", "km")).toBe("km-silvercode.acp.rename")
  })

  test("normalizeBdRef strips @<prefix>/ sigil", () => {
    expect(normalizeBdRef("@km/beads/foo", "km")).toBe("km-beads.foo")
    expect(normalizeBdRef("@km/silvercode/acp/rename", "km")).toBe("km-silvercode.acp.rename")
  })

  test("normalizeBdRef strips foreign sigil and keeps the path", () => {
    // Cross-vault refs in foreign-prefix form get treated as path-form locally.
    expect(normalizeBdRef("@other/beads/foo", "km")).toBe("km-beads.foo")
  })

  test("normalizeBdRef handles bd-form scope without prefix", () => {
    expect(normalizeBdRef("beads.foo", "km")).toBe("km-beads.foo")
  })

  test("normalizeBdRef honors a non-default prefix", () => {
    expect(normalizeBdRef("scope.thing", "vendor")).toBe("vendor-scope.thing")
    expect(normalizeBdRef("vendor-scope.thing", "vendor")).toBe("vendor-scope.thing")
    expect(normalizeBdRef("@vendor/scope/thing", "vendor")).toBe("vendor-scope.thing")
  })

  test("normalizeBdRef honors a non-km prefix end-to-end (regression: hardcoded prefix bug)", () => {
    // A vault with prefix=pim should produce pim-* ids, not km-*.
    expect(mintBeadName("pim")).toMatch(/^pim-[a-z0-9]{4}$/)
    expect(normalizeBdRef("issue.foo", "pim")).toBe("pim-issue.foo")
    expect(normalizeBdRef("@pim/scope/leaf", "pim")).toBe("pim-scope.leaf")
  })

  test("mintSubBeadName creates parent.N format", () => {
    const id = mintSubBeadName("km-auth-epic", 1)
    expect(id).toBe("km-auth-epic.1")
  })

  test("generates unique names", () => {
    const ids = new Set([mintBeadName("km"), mintBeadName("km"), mintBeadName("km")])
    expect(ids.size).toBe(3)
  })
})
