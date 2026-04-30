/**
 * Bead.displayId — canonical Bead → display string helper
 *
 * Single reader of the `shortId ?? id` chain (km-beads.retire-short-id-l4).
 * Every CLI formatter, JSON emitter, and log line goes through here so the
 * display rule lives in one place.
 */

import { describe, test, expect } from "vitest"
import { Bead } from "../src/bead.ts"
import type { Bead as BeadValue } from "../src/types.ts"

const baseBead: Omit<BeadValue, "id" | "shortId"> = {
  title: "Test",
  status: "todo",
  priority: "P2",
  createdAt: 0,
  updatedAt: 0,
}

describe("Bead.displayId", () => {
  test("returns shortId when present (canonical path-form)", () => {
    const bead: BeadValue = { ...baseBead, id: "01ABC", shortId: "@km/scope/slug" }
    expect(Bead.displayId(bead)).toBe("@km/scope/slug")
  })

  test("returns shortId when present (legacy bd-form)", () => {
    const bead: BeadValue = { ...baseBead, id: "01ABC", shortId: "km-abc1" }
    expect(Bead.displayId(bead)).toBe("km-abc1")
  })

  test("falls back to bead.id when shortId is undefined (non-bead)", () => {
    const bead: BeadValue = { ...baseBead, id: "01HXYZ12345678", shortId: undefined }
    expect(Bead.displayId(bead)).toBe("01HXYZ12345678")
  })

  test("does not coerce empty-string shortId — keeps falsy fallback", () => {
    // Empty string is falsy, so `??` keeps it but `||` would not.
    // Documenting current semantics: only undefined triggers fallback.
    const bead: BeadValue = { ...baseBead, id: "01ABC", shortId: "" }
    expect(Bead.displayId(bead)).toBe("")
  })
})
