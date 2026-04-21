/**
 * HelpOverlay v3 unit tests — pure reducer slice behavior.
 *
 * Mirrors the v2 parity test matrix (show/hide/toggle/scroll) to confirm
 * the createSlice-based reducer produces the same state transitions the
 * v1 + v2 reducers already pass. This is the regression lock that
 * unblocks replacing v1/v2 with v3 in production.
 *
 * See hub/silvery/pipe-with-composition-prototype.md for design rationale.
 */
import { describe, expect, test } from "vitest"

import { helpInit, helpSlice, type HelpState } from "../../src/plugins/help-overlay.v3.ts"

describe("help-overlay.v3 slice", () => {
  test("initial state has overlay hidden and no scroll offset", () => {
    const s = helpInit()
    expect(s.visible).toBe(false)
    expect(s.scrollOffset).toBe(0)
  })

  test("show: hidden → visible with scrollOffset reset to 0", () => {
    const next = helpSlice.show(helpInit())
    expect(next.visible).toBe(true)
    expect(next.scrollOffset).toBe(0)
  })

  test("show: visible → same reference (no-op)", () => {
    const s: HelpState = { visible: true, scrollOffset: 3 }
    const next = helpSlice.show(s)
    expect(next).toBe(s)
  })

  test("hide: visible → hidden, scrollOffset reset", () => {
    const s: HelpState = { visible: true, scrollOffset: 5 }
    const next = helpSlice.hide(s)
    expect(next.visible).toBe(false)
    expect(next.scrollOffset).toBe(0)
  })

  test("hide: hidden → same reference (no-op)", () => {
    const s = helpInit()
    const next = helpSlice.hide(s)
    expect(next).toBe(s)
  })

  test("toggle: hidden → visible", () => {
    const next = helpSlice.toggle(helpInit())
    expect(next.visible).toBe(true)
    expect(next.scrollOffset).toBe(0)
  })

  test("toggle: visible → hidden with scrollOffset reset", () => {
    const s: HelpState = { visible: true, scrollOffset: 7 }
    const next = helpSlice.toggle(s)
    expect(next.visible).toBe(false)
    expect(next.scrollOffset).toBe(0)
  })

  test("scrollDown: visible increments offset", () => {
    const s: HelpState = { visible: true, scrollOffset: 3 }
    const next = helpSlice.scrollDown(s)
    expect(next.scrollOffset).toBe(4)
  })

  test("scrollUp: visible decrements offset, floors at 0", () => {
    const s: HelpState = { visible: true, scrollOffset: 2 }
    const next = helpSlice.scrollUp(s)
    expect(next.scrollOffset).toBe(1)
    const zeroed = helpSlice.scrollUp({ visible: true, scrollOffset: 0 })
    expect(zeroed.scrollOffset).toBe(0)
  })

  test("scroll: hidden → no-op (same reference)", () => {
    const hidden = helpInit()
    expect(helpSlice.scrollUp(hidden)).toBe(hidden)
    expect(helpSlice.scrollDown(hidden)).toBe(hidden)
  })
})

describe("help-overlay.v3 apply", () => {
  test("typed dispatch via apply() — show + toggle + hide sequence", () => {
    let s = helpInit()
    s = helpSlice.apply(s, { op: "show" })
    expect(s.visible).toBe(true)
    s = helpSlice.apply(s, { op: "scrollDown" })
    expect(s.scrollOffset).toBe(1)
    s = helpSlice.apply(s, { op: "toggle" })
    expect(s.visible).toBe(false)
    s = helpSlice.apply(s, { op: "toggle" })
    expect(s.visible).toBe(true)
    expect(s.scrollOffset).toBe(0)
    s = helpSlice.apply(s, { op: "hide" })
    expect(s.visible).toBe(false)
  })

  test("apply() throws on unknown op", () => {
    expect(() => {
      helpSlice.apply(helpInit(), { op: "nonexistent" as "show" })
    }).toThrow(/unknown op/i)
  })
})

describe("help-overlay.v3 parity with v2 state shape", () => {
  test("state shape matches v2 (visible + scrollOffset)", () => {
    const keys = Object.keys(helpInit()).sort()
    expect(keys).toEqual(["scrollOffset", "visible"])
  })

  test("show → hide round-trip returns to init reference equality-wise", () => {
    const init = helpInit()
    let s = helpSlice.show(init)
    expect(s).not.toBe(init)
    s = helpSlice.hide(s)
    expect(s.visible).toBe(init.visible)
    expect(s.scrollOffset).toBe(init.scrollOffset)
  })
})
