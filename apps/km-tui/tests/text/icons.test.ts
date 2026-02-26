/**
 * Tests for icon utilities (Layer 1)
 */

import { describe, it, expect } from "vitest"
import { getStatusIcon, getTypeIcon, type StatusIcon } from "../../src/index.ts"

describe("getStatusIcon", () => {
  const knownStatuses: Array<[string, string, string]> = [
    ["todo", "□", "$text"],
    ["wip", "□", "$warning"],
    ["blocked", "✗", "$error"],
    ["done", "✓", "$success"],
    ["dropped", "✗", "$muted"],
  ]

  for (const [status, char, color] of knownStatuses) {
    it(`returns ${char} (${color}) for ${status}`, () => {
      const icon = getStatusIcon(status)
      expect(icon.char).toBe(char)
      expect(icon.color).toBe(color)
    })
  }

  for (const val of [null, undefined]) {
    it(`returns red warning triangle for ${val} (missing status)`, () => {
      const icon = getStatusIcon(val)
      expect(icon.char).toBe("⚠")
      expect(icon.color).toBe("$error")
      expect(icon.backgroundColor).toBeUndefined()
    })
  }

  for (const status of ["invalid", "x"]) {
    it(`returns first char with inverted colors for unrecognized '${status}'`, () => {
      const icon = getStatusIcon(status)
      expect(icon.char).toBe(status[0])
      expect(icon.color).toBe("$selectedfg")
      expect(icon.backgroundColor).toBe("$text")
    })
  }
})

describe("getTypeIcon", () => {
  const outlineTypes: Array<[string, string]> = [
    ["folder", "📁"],
    ["mdfile", "📄"],
    ["mdsection", "#"],
  ]

  for (const [fstype, icon] of outlineTypes) {
    it(`returns ${icon} for outline (h, item=true) ${fstype}`, () => {
      expect(getTypeIcon("h", fstype, true)).toBe(icon)
    })
  }

  const emptyTypes = ["p", "code", "quote"]
  for (const type of emptyTypes) {
    it(`returns empty string for ${type}`, () => {
      expect(getTypeIcon(type)).toBe("")
    })
  }

  const middleDotTypes = ["unknown", "list-item"]
  for (const type of middleDotTypes) {
    it(`returns middle dot for ${type}`, () => {
      expect(getTypeIcon(type)).toBe("·")
    })
  }
})
