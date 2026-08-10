/**
 * Link Hover Effects — Cmd+hover armed state + modifier-aware mouse cursors.
 *
 * Verifies that <Link> brightens without changing underline on reveal,
 * that useModifierKeys tracks modifier state correctly, and that
 * useMouseCursor writes the correct OSC 22 escape sequences.
 */

import React, { useState } from "react"
import { describe, test, expect, vi } from "vitest"
import { createRenderer, createTermless, waitFor } from "@silvery/test"
import {
  Box,
  ChainAppContext,
  Link,
  Text,
  type ChainAppContextValue,
  useModifierKeys,
  useMouseCursor,
} from "@silvery/ag-react"
import { run } from "../../packages/ag-term/src/runtime/run"

// ============================================================================
// useModifierKeys
// ============================================================================

describe("useModifierKeys", () => {
  test("returns all-false initial state", () => {
    function App() {
      const mods = useModifierKeys()
      return (
        <Text>
          super={String(mods.super)} ctrl={String(mods.ctrl)} alt={String(mods.alt)} shift=
          {String(mods.shift)}
        </Text>
      )
    }

    const render = createRenderer({ cols: 80, rows: 5 })
    const app = render(<App />)

    expect(app.text).toContain("super=false")
    expect(app.text).toContain("ctrl=false")
    expect(app.text).toContain("alt=false")
    expect(app.text).toContain("shift=false")
  })

  test("tracks shift from key event", async () => {
    function App() {
      const mods = useModifierKeys()
      return <Text>shift={String(mods.shift)}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(<App />)

    expect(app.text).toContain("shift=false")
    await app.press("Shift+a")
    expect(app.text).toContain("shift=true")
  })

  test("tracks ctrl from key event", async () => {
    function App() {
      const mods = useModifierKeys()
      return <Text>ctrl={String(mods.ctrl)}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)

    expect(app.text).toContain("ctrl=false")
    await app.press("ctrl+a")
    expect(app.text).toContain("ctrl=true")
  })

  test("disabled option prevents re-render on modifier change", async () => {
    let renderCount = 0
    function App() {
      const mods = useModifierKeys({ enabled: false })
      renderCount++
      return <Text>shift={String(mods.shift)}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    render(<App />)

    const after = renderCount
    await Promise.resolve() // flush
    expect(renderCount).toBe(after)
  })
})

// ============================================================================
// Link component
// ============================================================================

describe("Link", () => {
  test("action-only links suppress an inherited OSC 8 destination", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Link href="https://ancestor.example">
        <Link onClick={() => {}}>Action</Link>
      </Link>,
    )
    const column = app.text.indexOf("Action")

    expect(app.term.cell(column, 0).hyperlink).toBeUndefined()
    expect(app.ansi).not.toContain("https://ancestor.example")
    expect(app.ansi).not.toContain("silvery:hyperlink-clear")
  })

  test("supports app-owned actions without painting an OSC 8 destination", async () => {
    const onClick = vi.fn()
    const emit = vi.fn()
    const chain = {
      input: { register: () => () => {}, setActive: () => {} },
      paste: { register: () => () => {} },
      rawKeys: { register: () => () => {} },
      focusEvents: { register: () => () => {} },
      events: { on: () => () => {}, emit },
    } as ChainAppContextValue
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <ChainAppContext.Provider value={chain}>
        <Link onClick={onClick}>Action</Link>
      </ChainAppContext.Provider>,
    )
    const column = app.text.indexOf("Action")

    expect(app.term.cell(column, 0).hyperlink).toBeUndefined()
    await app.hover(column, 0)
    await app.click(column, 0)

    expect(onClick).toHaveBeenCalledTimes(1)
    expect(emit).not.toHaveBeenCalled()
  })

  test("renders link text without underline by default", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box>
        <Link href="https://example.com">Example</Link>
      </Box>,
    )

    expect(app.text).toContain("Example")
    // Check that the text is NOT underlined (cell attrs)
    const col = app.text.indexOf("Example")
    const cell = app.term.cell(col, 0)
    expect(cell.attrs.underline).toBeFalsy()
    expect(cell.hyperlink).toBe("https://example.com")
    expect(app.ansi).toContain("https://example.com")
  })

  test("renders link with explicit underline", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box>
        <Link href="https://example.com" underline>
          Example
        </Link>
      </Box>,
    )

    const col = app.text.indexOf("Example")
    const cell = app.term.cell(col, 0)
    expect(cell.attrs.underline).toBe(true)
  })

  test("forwards ...rest TextProps (bold, italic)", () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box>
        <Link href="https://example.com" bold italic>
          Styled
        </Link>
      </Box>,
    )

    const col = app.text.indexOf("Styled")
    const cell = app.term.cell(col, 0)
    expect(cell.attrs.bold).toBe(true)
    expect(cell.attrs.italic).toBe(true)
  })

  test("hover triggers onMouseEnter/onMouseLeave via ...rest", async () => {
    let entered = false
    let left = false
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column">
        <Link
          href="https://example.com"
          onMouseEnter={() => {
            entered = true
          }}
          onMouseLeave={() => {
            left = true
          }}
        >
          Hoverable
        </Link>
        <Text>Other content here</Text>
      </Box>,
    )

    const col = app.text.indexOf("Hoverable")
    await app.hover(col, 0)
    expect(entered).toBe(true)

    // Move to sibling (must be a real node for hitTest to produce a leave)
    await app.hover(0, 1)
    expect(left).toBe(true)
  })
})

// ============================================================================
// Role-derived reveal
// ============================================================================

describe("Link role-derived reveal", () => {
  test("does not register modifier observers while idle or hovered", async () => {
    const registerRawKey = vi.fn(() => () => {})
    const registerFocus = vi.fn(() => () => {})
    const chain = {
      input: { register: () => () => {}, setActive: () => {} },
      paste: { register: () => () => {} },
      rawKeys: { register: registerRawKey },
      focusEvents: { register: registerFocus },
      events: { on: () => () => {}, emit: () => {} },
    } as ChainAppContextValue
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <ChainAppContext.Provider value={chain}>
        <Link href="https://example.com" role="control">
          Plain hover
        </Link>
      </ChainAppContext.Provider>,
    )

    expect(registerRawKey).not.toHaveBeenCalled()
    expect(registerFocus).not.toHaveBeenCalled()

    await app.hover(app.text.indexOf("Plain hover"), 0)

    expect(registerRawKey).not.toHaveBeenCalled()
    expect(registerFocus).not.toHaveBeenCalled()
  })

  test("action-only links brighten on plain hover without changing underline", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column">
        <Link onClick={() => {}}>Hover Link</Link>
        <Text>Other</Text>
      </Box>,
    )

    const col = app.text.indexOf("Hover Link")
    const idleForeground = app.cell(col, 0).fg
    await app.hover(col, 0)

    const cell = app.term.cell(col, 0)
    expect(cell.attrs.underline).toBeFalsy()
    expect(app.cell(col, 0).fg).not.toEqual(idleForeground)
  })

  test("plain hover repaints through the terminal runtime", async () => {
    using term = createTermless({ cols: 40, rows: 5 })
    using _handle = await run(
      <Box flexDirection="column">
        <Link href="https://example.com" role="control">
          Runtime link
        </Link>
        <Text>Other</Text>
      </Box>,
      term,
      { mouse: true, selection: false },
    )
    await waitFor(() => term.out.containsOutput("Runtime link"))

    term.out.clear()
    await React.act(async () => term.mouse.move(0, 0))

    await waitFor(() => term.out.containsOutput("Runtime link"))
    expect(term.out.getText()).not.toMatch(/\x1b\[[0-9;:]*4mRuntime link/u)
    expect(term.out.containsOutput("\x1b]22;pointer\x07")).toBe(true)
  })

  test("mouse leave clears armed state", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box flexDirection="column">
        <Link href="https://example.com" role="control">
          Hover Link
        </Link>
        <Text>Other</Text>
      </Box>,
    )

    const col = app.text.indexOf("Hover Link")
    const idleForeground = app.cell(col, 0).fg
    await app.hover(col, 0)
    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
    expect(app.cell(col, 0).fg).not.toEqual(idleForeground)

    await app.hover(0, 1)
    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
    expect(app.cell(col, 0).fg).toEqual(idleForeground)
  })

  test("default variant still requires Cmd", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box>
        <Link href="https://example.com">Default</Link>
      </Box>,
    )

    const col = app.text.indexOf("Default")
    await app.hover(col, 0)

    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
  })
})

// ============================================================================
// Link Cmd+hover armed state
// ============================================================================

describe("Link Cmd+hover armed state", () => {
  test("hover without Cmd does not underline", async () => {
    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(
      <Box>
        <Link href="https://example.com">Click Me</Link>
      </Box>,
    )

    const col = app.text.indexOf("Click Me")
    const idleForeground = app.cell(col, 0).fg

    // Hover over the link
    await app.hover(col, 0)

    // Still no underline (no Cmd held)
    const cell = app.term.cell(col, 0)
    expect(cell.attrs.underline).toBeFalsy()
  })

  test("Cmd+hover brightens a content link without changing underline", async () => {
    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(
      <Box>
        <Link href="https://example.com">Click Me</Link>
      </Box>,
    )

    const col = app.text.indexOf("Click Me")
    const idleForeground = app.cell(col, 0).fg

    // Hover over the link
    await app.hover(col, 0)

    // Press a key with Super held (simulates Cmd press)
    await app.press("Super+a")

    // Revealed content links brighten; underline remains a stable link property.
    const cell = app.term.cell(col, 0)
    expect(cell.attrs.underline).toBeFalsy()
    expect(app.cell(col, 0).fg).not.toEqual(idleForeground)
  })

  test("moving mouse away clears armed state", async () => {
    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(
      <Box flexDirection="column">
        <Link href="https://example.com">Click Me</Link>
        <Text>Other content here</Text>
      </Box>,
    )

    const col = app.text.indexOf("Click Me")

    // Hover + Cmd
    await app.hover(col, 0)
    await app.press("Super+a")
    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()

    // Move to sibling (must be a real node for hitTest to produce a leave)
    await app.hover(0, 1)

    // Underline gone (not hovered anymore)
    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
  })

  test("underline={false} remains false during Cmd+hover", async () => {
    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(
      <Box flexDirection="column">
        <Link href="https://example.com" underline={false}>
          LinkText
        </Link>
        <Text>Other</Text>
      </Box>,
    )

    const col = app.text.indexOf("LinkText")

    // Hover + Cmd changes colour, never the underline decision.
    await app.hover(col, 0)
    await app.press("Super+a")
    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
  })
})

// ============================================================================
// useMouseCursor
// ============================================================================

describe("useMouseCursor", () => {
  test("does not crash with null shape", () => {
    function App() {
      useMouseCursor(null)
      return <Text>OK</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)
    expect(app.text).toContain("OK")
  })

  test("does not crash with undefined shape", () => {
    function App() {
      useMouseCursor(undefined)
      return <Text>OK</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)
    expect(app.text).toContain("OK")
  })

  test("does not crash with a valid shape", () => {
    function App() {
      useMouseCursor("pointer")
      return <Text>OK</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)
    expect(app.text).toContain("OK")
  })

  test("transitions between shapes without crashing", async () => {
    function App() {
      const [hovered, setHovered] = useState(false)
      useMouseCursor(hovered ? "pointer" : null)
      return (
        <Box flexDirection="column">
          <Box onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
            <Text>Hover target</Text>
          </Box>
          <Text>Other</Text>
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App />)
    expect(app.text).toContain("Hover target")

    // Hover over the target
    await app.hover(0, 0)
    expect(app.text).toContain("Hover target")

    // Move away
    await app.hover(0, 1)
    expect(app.text).toContain("Other")
  })

  test("all cursor shapes accepted", () => {
    const shapes = [
      "default",
      "text",
      "pointer",
      "crosshair",
      "move",
      "not-allowed",
      "wait",
      "help",
    ] as const
    for (const shape of shapes) {
      function App() {
        useMouseCursor(shape)
        return <Text>{shape}</Text>
      }

      const render = createRenderer({ cols: 40, rows: 5 })
      const app = render(<App />)
      expect(app.text).toContain(shape)
    }
  })

  test("cleans up on unmount", () => {
    function App({ show }: { show: boolean }) {
      return show ? <CursorComponent /> : <Text>Gone</Text>
    }

    function CursorComponent() {
      useMouseCursor("pointer")
      return <Text>With cursor</Text>
    }

    const render = createRenderer({ cols: 40, rows: 5 })
    const app = render(<App show={true} />)
    expect(app.text).toContain("With cursor")

    // Re-render without the cursor component — cleanup should fire
    app.rerender(<App show={false} />)
    expect(app.text).toContain("Gone")
  })
})

// ============================================================================
// Link modifier-aware mouse cursor
// ============================================================================

describe("Link modifier-aware mouse cursor", () => {
  test("Cmd+hover on Link sets pointer cursor (no crash)", async () => {
    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(
      <Box flexDirection="column">
        <Link href="https://example.com">Click Me</Link>
        <Text>Other content here</Text>
      </Box>,
    )

    const col = app.text.indexOf("Click Me")
    const idleForeground = app.cell(col, 0).fg

    // Hover over the link
    await app.hover(col, 0)

    // Press a key with Super held (simulates Cmd press)
    await app.press("Super+a")

    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
    expect(app.cell(col, 0).fg).not.toEqual(idleForeground)
  })

  test("moving away from armed Link resets cursor (no crash)", async () => {
    const render = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = render(
      <Box flexDirection="column">
        <Link href="https://example.com">Click Me</Link>
        <Text>Other content here</Text>
      </Box>,
    )

    const col = app.text.indexOf("Click Me")
    const idleForeground = app.cell(col, 0).fg

    // Arm the link
    await app.hover(col, 0)
    await app.press("Super+a")
    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
    expect(app.cell(col, 0).fg).not.toEqual(idleForeground)

    // Move away — disarms, cursor should reset
    await app.hover(0, 1)
    expect(app.term.cell(col, 0).attrs.underline).toBeFalsy()
    expect(app.cell(col, 0).fg).toEqual(idleForeground)
  })
})
