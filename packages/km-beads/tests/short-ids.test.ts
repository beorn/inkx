import { describe, test, expect } from "vitest"
import { generateShortId, generateCustomId, generateSubId } from "../src/short-ids.ts"

describe("Short ID utilities", () => {
  test("generateShortId produces <prefix>-xxxx format", () => {
    expect(generateShortId("km")).toMatch(/^km-[a-z0-9]{4}$/)
    expect(generateShortId("pim")).toMatch(/^pim-[a-z0-9]{4}$/)
  })

  test("generateCustomId adds prefix", () => {
    expect(generateCustomId("auth-epic", "km")).toBe("km-auth-epic")
  })

  test("generateCustomId is idempotent on already-prefixed ids (regression: km-beads.create-double-prefix)", () => {
    expect(generateCustomId("km-beads.foo", "km")).toBe("km-beads.foo")
    expect(generateCustomId("km-silvercode.acp.rename", "km")).toBe("km-silvercode.acp.rename")
  })

  test("generateCustomId converts path-form to bd-form", () => {
    expect(generateCustomId("beads/foo", "km")).toBe("km-beads.foo")
    expect(generateCustomId("silvercode/acp/rename", "km")).toBe("km-silvercode.acp.rename")
  })

  test("generateCustomId strips @<prefix>/ sigil", () => {
    expect(generateCustomId("@km/beads/foo", "km")).toBe("km-beads.foo")
    expect(generateCustomId("@km/silvercode/acp/rename", "km")).toBe("km-silvercode.acp.rename")
  })

  test("generateCustomId strips foreign sigil and keeps the path", () => {
    // Cross-vault refs in foreign-prefix form get treated as path-form locally.
    expect(generateCustomId("@other/beads/foo", "km")).toBe("km-beads.foo")
  })

  test("generateCustomId handles bd-form scope without prefix", () => {
    expect(generateCustomId("beads.foo", "km")).toBe("km-beads.foo")
  })

  test("generateCustomId honors a non-default prefix", () => {
    expect(generateCustomId("scope.thing", "vendor")).toBe("vendor-scope.thing")
    expect(generateCustomId("vendor-scope.thing", "vendor")).toBe("vendor-scope.thing")
    expect(generateCustomId("@vendor/scope/thing", "vendor")).toBe("vendor-scope.thing")
  })

  test("generateCustomId honors a non-km prefix end-to-end (regression: hardcoded prefix bug)", () => {
    // A vault with prefix=pim should produce pim-* ids, not km-*.
    expect(generateShortId("pim")).toMatch(/^pim-[a-z0-9]{4}$/)
    expect(generateCustomId("issue.foo", "pim")).toBe("pim-issue.foo")
    expect(generateCustomId("@pim/scope/leaf", "pim")).toBe("pim-scope.leaf")
  })

  test("generateSubId creates parent.N format", () => {
    const id = generateSubId("km-auth-epic", 1)
    expect(id).toBe("km-auth-epic.1")
  })

  test("generates unique IDs", () => {
    const ids = new Set([generateShortId("km"), generateShortId("km"), generateShortId("km")])
    expect(ids.size).toBe(3)
  })
})
