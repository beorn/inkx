import { describe, expect, test } from "vitest"
import { enableMouse, disableMouse } from "@silvery/ansi"
import { parseMouseSequence } from "@silvery/ag-term/mouse"
import { createMouseEvent, createWheelEvent } from "@silvery/ag-term/mouse-events"

describe("SGR mouse coordinates", () => {
  test("mouse protocol enables SGR-Pixels only when requested", () => {
    expect(enableMouse()).toBe("\x1b[?1003h\x1b[?1006h")
    expect(enableMouse({ pixels: true })).toBe("\x1b[?1003h\x1b[?1006h\x1b[?1016h")
    expect(disableMouse()).toBe("\x1b[?1016l\x1b[?1006l\x1b[?1003l")
  })

  test("cell mode reports terminal layout x/y without physical client coordinates", () => {
    const parsed = parseMouseSequence("\x1b[<0;13;9M")

    expect(parsed).toMatchObject({
      x: 12,
      y: 8,
      coordinateMode: "cell",
      action: "down",
      button: 0,
    })
    expect(parsed).not.toHaveProperty("clientX")
    expect(parsed).not.toHaveProperty("clientY")
  })

  test("SGR-Pixels mode reports fractional layout x/y and physical client coordinates", () => {
    const parsed = parseMouseSequence("\x1b[<32;101;141M", {
      coordinateMode: "pixel",
      cellSize: { width: 8, height: 16 },
    })

    expect(parsed).toMatchObject({
      x: 12.5,
      y: 8.75,
      clientX: 100,
      clientY: 140,
      coordinateMode: "pixel",
      action: "move",
      button: 0,
    })
  })

  test("SGR-Pixels conversion honors alternate cell sizes", () => {
    const parsed = parseMouseSequence("\x1b[<64;101;141M", {
      coordinateMode: "pixel",
      cellSize: { width: 10, height: 20 },
    })

    expect(parsed).toMatchObject({
      x: 10,
      y: 7,
      clientX: 100,
      clientY: 140,
      coordinateMode: "pixel",
      action: "wheel",
      delta: -1,
    })
  })

  test("synthetic events expose layout x/y and optional physical client coordinates", () => {
    const target = { props: {}, children: [] } as never
    const parsed = parseMouseSequence("\x1b[<0;101;141M", {
      coordinateMode: "pixel",
      cellSize: { width: 8, height: 16 },
    })
    expect(parsed).not.toBeNull()

    const event = createMouseEvent("mousedown", parsed!.x, parsed!.y, target, parsed!)

    expect(event).toMatchObject({ x: 12.5, y: 8.75, clientX: 100, clientY: 140 })
  })
})

// ============================================================================
// SGR wheel axis decoding — buttons 64/65/66/67 map to the correct axis.
// ============================================================================
//
// Regression: buttons 66 (wheel-left) and 67 (wheel-right) fell through the
// `wheelButton === 0 ? -1 : 1` branch to `delta: +1` (vertical-down), so a
// horizontal trackpad swipe surfaced as a spurious downward scroll. Each wheel
// tick is single-axis: up/down move deltaY, left/right move deltaX.
// X11 buttons 4/5/6/7 → SGR 64/65/66/67; 6=left, 7=right (DOM sign: right is +).

describe("SGR wheel axis decoding (buttons 64/65/66/67)", () => {
  test("button 64 (wheel-up) → deltaY -1, deltaX 0", () => {
    expect(parseMouseSequence("\x1b[<64;10;5M")).toMatchObject({
      action: "wheel",
      delta: -1,
      deltaX: 0,
    })
  })

  test("button 65 (wheel-down) → deltaY +1, deltaX 0", () => {
    expect(parseMouseSequence("\x1b[<65;10;5M")).toMatchObject({
      action: "wheel",
      delta: 1,
      deltaX: 0,
    })
  })

  test("button 66 (wheel-left) → deltaX -1, deltaY 0", () => {
    expect(parseMouseSequence("\x1b[<66;10;5M")).toMatchObject({
      action: "wheel",
      delta: 0,
      deltaX: -1,
    })
  })

  test("button 67 (wheel-right) → deltaX +1, deltaY 0", () => {
    expect(parseMouseSequence("\x1b[<67;10;5M")).toMatchObject({
      action: "wheel",
      delta: 0,
      deltaX: 1,
    })
  })

  test("horizontal wheel preserves modifier bits (66 + shift + ctrl = 86)", () => {
    // 86 = 64 (wheel) + 16 (ctrl) + 4 (shift) + 2 (left). raw&3 == 2 → left.
    expect(parseMouseSequence("\x1b[<86;10;5M")).toMatchObject({
      action: "wheel",
      delta: 0,
      deltaX: -1,
      shift: true,
      ctrl: true,
      meta: false,
    })
  })

  test("createWheelEvent threads the decoded axis into deltaX/deltaY", () => {
    const target = { props: {}, children: [] } as never

    const left = parseMouseSequence("\x1b[<66;3;2M")!
    expect(createWheelEvent(left.x, left.y, target, left)).toMatchObject({
      deltaX: -1,
      deltaY: 0,
    })

    const right = parseMouseSequence("\x1b[<67;3;2M")!
    expect(createWheelEvent(right.x, right.y, target, right)).toMatchObject({
      deltaX: 1,
      deltaY: 0,
    })

    const down = parseMouseSequence("\x1b[<65;3;2M")!
    expect(createWheelEvent(down.x, down.y, target, down)).toMatchObject({
      deltaX: 0,
      deltaY: 1,
    })
  })
})
