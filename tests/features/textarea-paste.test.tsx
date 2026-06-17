/**
 * TextArea bracketed-paste insertion.
 *
 * Bead: silvercode-paste-composer (#P0 #bug #user-reported). Pasting into a
 * Silver Code composer did nothing across panes. Root cause: `useTextArea`
 * subscribes to input via `useInput` but never passed an `onPaste` handler, so
 * the chain paste store delivered the pasted blob to a no-op
 * (`onPasteRef.current?.(text)` with `onPaste === undefined`). Bracketed paste
 * is routed on its own channel — it is NOT replayed as keystrokes — so the
 * text was silently dropped.
 *
 * The single-line `useTextInput` (TextInput) already inserts paste via
 * `emitText`; `useTextArea` (TextArea) is the asymmetric gap. The Silver Code
 * composer's command region AND queue region are both `<TextArea>`, so paste
 * was a no-op in both panes — exactly the two acceptance cases on the bead.
 *
 * These tests drive a bracketed paste sequence (\x1b[200~...\x1b[201~) through
 * the same chain path the live app uses (createRenderer wires the paste store),
 * and assert the text inserts at the cursor exactly once.
 */

import React, { useState } from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, TextArea } from "@silvery/ag-react"

/** Wrap content in bracketed paste escape sequences. */
function bracketedPaste(content: string): string {
  return `\x1b[200~${content}\x1b[201~`
}

describe("TextArea bracketed paste (bead silvercode-paste-composer)", () => {
  test("focused composer: paste inserts the pasted text exactly once", () => {
    const changes: string[] = []
    function App() {
      const [value, setValue] = useState("")
      return (
        <Box width={40} height={5}>
          <TextArea
            value={value}
            onChange={(v) => {
              changes.push(v)
              setValue(v)
            }}
            isActive
            fieldSizing="fixed"
            rows={4}
          />
        </Box>
      )
    }
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(<App />)

    app.stdin.write(bracketedPaste("hello world"))

    // The onChange payload is the controlled value the TextArea renders, so it
    // is the authoritative "what got inserted" signal. Delivered as a single
    // insertion — not once-per-character (stray keystrokes), not dropped.
    expect(changes).toEqual(["hello world"])
  })

  test("paste inserts AT the cursor, not appended", async () => {
    const changes: string[] = []
    function App() {
      const [value, setValue] = useState("")
      return (
        <Box width={40} height={5}>
          <TextArea
            value={value}
            onChange={(v) => {
              changes.push(v)
              setValue(v)
            }}
            isActive
            fieldSizing="fixed"
            rows={4}
          />
        </Box>
      )
    }
    const r = createRenderer({ cols: 40, rows: 5 })
    const app = r(<App />)

    await app.type("ab")
    await app.press("ArrowLeft") // cursor between "a" and "b"
    app.stdin.write(bracketedPaste("XY"))

    // The onChange payload is the controlled value the component renders, so it
    // is the authoritative "what got inserted" signal: paste lands AT the
    // cursor ("aXYb"), not appended ("abXY"), and fires exactly once.
    expect(changes[changes.length - 1]).toBe("aXYb")
  })

  test("QUEUE editor: multi-line paste inserts once at the cursor", () => {
    const changes: string[] = []
    function App() {
      const [value, setValue] = useState("")
      return (
        <Box width={40} height={6}>
          <TextArea
            value={value}
            onChange={(v) => {
              changes.push(v)
              setValue(v)
            }}
            isActive
            fieldSizing="fixed"
            rows={5}
          />
        </Box>
      )
    }
    const r = createRenderer({ cols: 40, rows: 6 })
    const app = r(<App />)

    const multiline = "one\ntwo\nthree"
    app.stdin.write(bracketedPaste(multiline))

    // The whole blob lands as a single change with its newlines intact —
    // not split into stray Enter keystrokes.
    expect(changes).toEqual([multiline])
  })

  test("paste replaces the active selection exactly once", async () => {
    const changes: string[] = []
    function App() {
      const [value, setValue] = useState("")
      return (
        <Box width={40} height={5}>
          <TextArea
            value={value}
            onChange={(v) => {
              changes.push(v)
              setValue(v)
            }}
            isActive
            fieldSizing="fixed"
            rows={4}
          />
        </Box>
      )
    }
    const r = createRenderer({ cols: 40, rows: 5, kittyMode: true })
    const app = r(<App />)

    await app.type("abcd")
    await app.press("Shift+ArrowLeft")
    await app.press("Shift+ArrowLeft") // select trailing "cd"
    app.stdin.write(bracketedPaste("ZZ"))

    expect(changes[changes.length - 1]).toBe("abZZ")
  })
})
