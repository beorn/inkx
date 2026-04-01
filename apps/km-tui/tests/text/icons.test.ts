/**
 * Tests for icon utilities (Layer 1)
 */

import { describe, it, expect } from "vitest"
import { getStatusIcon, getTypeIcon, type StatusIcon } from "../../src/index.ts"

describe("getStatusIcon", () => {
  it.each([
    ["todo", "□", "$fg"],
    ["wip", "□", "$warning"],
    ["blocked", "✗", "$error"],
    ["done", "✓", "$success"],
    ["dropped", "✗", "$muted"],
  ] as const)("returns %s icon with correct char and color", (status, char, color) => {
    const icon = getStatusIcon(status)
    expect(icon.char).toBe(char)
    expect(icon.color).toBe(color)
  })

  it.each([null, undefined])("returns red warning triangle for %s (missing status)", (val) => {
    const icon = getStatusIcon(val)
    expect(icon.char).toBe("⚠")
    expect(icon.color).toBe("$error")
    expect(icon.backgroundColor).toBeUndefined()
  })

  it.each(["invalid", "x"])("returns first char with inverted colors for unrecognized '%s'", (status) => {
    const icon = getStatusIcon(status)
    expect(icon.char).toBe(status[0])
    expect(icon.color).toBe("$selection")
    expect(icon.backgroundColor).toBe("$fg")
  })
})

describe("getTypeIcon", () => {
  it.each([
    ["folder", "📁"],
    ["mdfile", "📄"],
    ["mdsection", "#"],
  ] as const)("returns %s icon for outline (h, item=true) %s", (fstype, icon) => {
    expect(getTypeIcon("h", fstype, {})).toBe(icon)
  })

  it.each(["p", "code", "quote"])("returns empty string for %s", (type) => {
    expect(getTypeIcon(type)).toBe("")
  })

  it.each(["unknown", "list-item"])("returns middle dot for %s", (type) => {
    expect(getTypeIcon(type)).toBe("·")
  })
})
