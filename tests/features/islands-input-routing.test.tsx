/**
 * <Island> focused input routing through createApp.
 *
 * Terminal-pane consumers need a focused Island to receive PTY-shaped input:
 * keys as ANSI bytes and mouse reports translated into island-local SGR
 * coordinates. Protocol mode aggregation is covered in
 * islands-mode-routing.test.tsx; this file pins the actual event delivery.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Island, Text, useInput } from "@silvery/ag-react"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import { keyToAnsi, parseKey } from "@silvery/ag/keys"
import { createTermless } from "@silvery/test"
import type {
  IslandGuest,
  IslandHandle,
  IslandInputOwner,
  IslandModesOwner,
  IslandOutputOwner,
  IslandProtocolModes,
  IslandSizeOwner,
} from "@silvery/ag/island-types"
import { run } from "../../packages/ag-term/src/runtime/run"

// `opts.modes` lets a guest declare its desired protocol modes (e.g. mouse
// tracking). The runtime only forwards mouse events to a guest that has ENABLED
// mouse reporting via this mode state (@hab/.../20349), so the mouse test below
// must model a guest that requested it.
function createInputRecorderGuest(opts: { modes?: IslandProtocolModes } = {}): {
  guest: IslandGuest
  feeds: string[]
} {
  const feeds: string[] = []
  const decoder = new TextDecoder()
  const declaresModes = opts.modes !== undefined
  const modes = opts.modes ?? {}
  const guest: IslandGuest = {
    capabilities: { input: true, modes: declaresModes },
    init(ctx) {
      const size: IslandSizeOwner = {
        get cols() {
          return ctx.cols
        },
        get rows() {
          return ctx.rows
        },
        subscribe: () => () => {},
        requestResize: () => {},
      }
      const output: IslandOutputOwner = {
        buffer: createCellBuffer(ctx.cols, ctx.rows),
        cursor: null,
        cursorVisible: false,
        subscribe: () => () => {},
        writeCells: () => {},
        invalidateAll: () => {},
      }
      const input: IslandInputOwner = {
        feed(bytes) {
          feeds.push(decoder.decode(bytes))
        },
      }
      const modesOwner: IslandModesOwner = {
        get modes() {
          return modes
        },
        subscribe: () => () => {},
      }
      const handle: IslandHandle = {
        size,
        output,
        input,
        ...(declaresModes ? { modes: modesOwner } : {}),
        dispose: () => {},
      }
      ctx.emit({ type: "ready" })
      return Promise.resolve(handle)
    },
  }
  return { guest, feeds }
}

async function settle(ms = 30): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

describe("focused Island input routing", () => {
  test("keys feed the focused island and do not fall through to useInput", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()
    const hostInputs: string[] = []

    function App(): React.ReactElement {
      useInput((input) => {
        hostInputs.push(input)
      })
      return (
        <Box flexDirection="column">
          <Island guest={recorder.guest} cols={10} rows={2} focusable />
          <Text>after</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term)
    try {
      await handle.press("Tab")
      await handle.press("a")
      await settle()

      expect(recorder.feeds).toEqual(["a"])
      expect(hostInputs).toEqual([])
    } finally {
      handle.unmount()
    }
  })

  test("focused island stops owning input when it becomes non-focusable", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()
    const hostInputs: string[] = []
    // Ref-like holder: a closure-assigned `let` narrows to `null` (CFA never) at
    // the call site, so capture the setter through a typed holder property.
    const islandFocusableSetter: {
      current: React.Dispatch<React.SetStateAction<boolean>> | null
    } = { current: null }

    function App(): React.ReactElement {
      const [islandFocusable, setIslandFocusable] = React.useState(true)
      React.useEffect(() => {
        islandFocusableSetter.current = setIslandFocusable
        return () => {
          islandFocusableSetter.current = null
        }
      }, [setIslandFocusable])
      useInput((input) => {
        hostInputs.push(input)
      })
      return (
        <Box flexDirection="column">
          <Island guest={recorder.guest} cols={10} rows={2} focusable={islandFocusable} />
          <Text>after</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term)
    try {
      await handle.press("Tab")
      await handle.press("a")
      await settle()
      expect(recorder.feeds).toEqual(["a"])
      expect(hostInputs).toEqual([])

      islandFocusableSetter.current?.(false)
      await settle()
      await handle.press("b")
      await settle()

      expect(recorder.feeds).toEqual(["a"])
      expect(hostInputs).toEqual(["b"])
    } finally {
      handle.unmount()
    }
  })

  test("focusability updates clean up the owning render root only", async () => {
    using termA = createTermless({ cols: 40, rows: 8 })
    using termB = createTermless({ cols: 40, rows: 8 })
    const recorderA = createInputRecorderGuest()
    const recorderB = createInputRecorderGuest()
    const hostInputsA: string[] = []
    const hostInputsB: string[] = []
    // Ref-like holder (see the single-root test above) for root A's setter.
    const focusableSetterA: { current: React.Dispatch<React.SetStateAction<boolean>> | null } = {
      current: null,
    }

    function AppA(): React.ReactElement {
      const [islandFocusable, setIslandFocusable] = React.useState(true)
      React.useEffect(() => {
        focusableSetterA.current = setIslandFocusable
        return () => {
          focusableSetterA.current = null
        }
      }, [setIslandFocusable])
      useInput((input) => {
        hostInputsA.push(input)
      })
      return (
        <Box flexDirection="column">
          <Island guest={recorderA.guest} cols={10} rows={2} focusable={islandFocusable} />
          <Text>after-a</Text>
        </Box>
      )
    }

    function AppB(): React.ReactElement {
      useInput((input) => {
        hostInputsB.push(input)
      })
      return (
        <Box flexDirection="column">
          <Island guest={recorderB.guest} cols={10} rows={2} focusable />
          <Text>after-b</Text>
        </Box>
      )
    }

    const handleA = await run(<AppA />, termA)
    const handleB = await run(<AppB />, termB)
    try {
      await handleA.press("Tab")
      await handleB.press("Tab")
      await handleA.press("a")
      await handleB.press("b")
      await settle()
      expect(recorderA.feeds).toEqual(["a"])
      expect(recorderB.feeds).toEqual(["b"])

      focusableSetterA.current?.(false)
      await settle()
      await handleA.press("c")
      await handleB.press("d")
      await settle()

      expect(recorderA.feeds).toEqual(["a"])
      expect(hostInputsA).toEqual(["c"])
      expect(recorderB.feeds).toEqual(["b", "d"])
      expect(hostInputsB).toEqual([])
    } finally {
      handleB.unmount()
      handleA.unmount()
    }
  })

  test("mouse reports feed focused island with island-local SGR coordinates", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    // The guest enabled mouse reporting → the host forwards mouse to it.
    const recorder = createInputRecorderGuest({ modes: { mouseTracking: "any" } })

    const handle = await run(
      <Box flexDirection="column">
        <Island guest={recorder.guest} cols={10} rows={3} focusable />
        <Text>after</Text>
      </Box>,
      term,
      { mouse: true } as never,
    )
    try {
      await handle.press("Tab")
      await term.mouse.click(3, 1)
      await settle()

      expect(recorder.feeds).toContain("\x1b[<0;4;2M")
      expect(recorder.feeds).toContain("\x1b[<0;4;2m")
    } finally {
      handle.unmount()
    }
  })
})

// All 21 US-QWERTY shifted-punctuation pairs: [base key, shifted char]. Typing
// the shifted char emits silvery's two-layer key event (keys.ts): `input` is
// normalized to the BASE key for keybinding matching (`$` → "4", key.shift),
// while `key.text` carries the REAL typed character (`$`). A focused terminal
// guest must be fed the real character — feeding the normalized base key sends
// "4" to the shell for a typed "$" (the A4 shift-strip regression).
const SHIFTED_PUNCT_PAIRS: ReadonlyArray<readonly [base: string, shifted: string]> = [
  ["1", "!"],
  ["2", "@"],
  ["3", "#"],
  ["4", "$"],
  ["5", "%"],
  ["6", "^"],
  ["7", "&"],
  ["8", "*"],
  ["9", "("],
  ["0", ")"],
  ["-", "_"],
  ["=", "+"],
  ["`", "~"],
  ["[", "{"],
  ["]", "}"],
  ["\\", "|"],
  [";", ":"],
  ["'", '"'],
  [",", "<"],
  [".", ">"],
  ["/", "?"],
]

describe("focused Island shifted-punctuation feed (A4 shift-strip)", () => {
  test.each(SHIFTED_PUNCT_PAIRS)(
    "typing Shift+%s feeds the real char %s to the guest, not the base key",
    async (base, shifted) => {
      // Pressing Shift+<base> is the physically faithful, mode-independent way
      // to type the shifted char: it parses to the two-layer event in BOTH the
      // legacy and kitty harnesses (input=base, key.text=shifted). Guard that
      // the routing precondition holds before asserting the guest feed — this
      // is the exact keyToAnsi→parseKey path the legacy press() harness runs.
      const [parsedInput, parsedKey] = parseKey(keyToAnsi(`Shift+${base}`))
      expect(parsedInput).toBe(base)
      expect(parsedKey.text).toBe(shifted)

      using term = createTermless({ cols: 40, rows: 8 })
      const recorder = createInputRecorderGuest()

      const handle = await run(
        <Box flexDirection="column">
          <Island guest={recorder.guest} cols={10} rows={2} focusable />
          <Text>after</Text>
        </Box>,
        term,
      )
      try {
        await handle.press("Tab")
        await handle.press(`Shift+${base}`)
        await settle()

        expect(recorder.feeds).toEqual([shifted])
      } finally {
        handle.unmount()
      }
    },
  )
})
