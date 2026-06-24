/**
 * <Island> host-reserved-input (tmux-prefix model).
 *
 * A focused input-capable island forwards EVERY key/mouse event to its guest
 * (see `routeKeyToFocusedIsland` / `routeMouseToFocusedIsland` in
 * `packages/ag-term/src/runtime/event-handlers.ts`). That is correct for a
 * full-screen guest, but a multi-pane host (e.g. the hab "deck" shell pane)
 * needs to RESERVE a few keys/mouse events for itself — the tmux `Ctrl-b`
 * prefix, a pane-switch click — so they reach the host's own `useInput` /
 * mouse handling instead of being swallowed by the guest.
 *
 * This suite pins the additive, opt-in `reserveInput` / `reserveMouse`
 * predicates on `<Island>`:
 *
 *   - reserveInput(input, key) => true  → key is NOT fed to the guest; it
 *     falls through to the app's `useInput`.
 *   - reserveMouse(data)       => true  → mouse event is NOT SGR-fed to the
 *     guest; it reaches the host mouse path (DOM dispatch + app handlers).
 *
 * When the predicates are absent, the guest captures everything (current
 * behavior — the regression guards below prove it).
 *
 * Harness mirrors islands-input-routing.test.tsx: the REAL `run()` runtime over
 * `createTermless`, keys via `handle.press()` (routes through
 * `withFocusChain → handleFocusNavigation → routeKeyToFocusedIsland` — the same
 * path the batched event loop uses) and mouse via `term.mouse.click()` (the
 * real terminal mouse-parse path).
 *
 * Bead @hab/19797-hab-master/20349-shell-input-trap.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { Box, Island, Text, useInput } from "@silvery/ag-react"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import { createTermless } from "@silvery/test"
import type {
  IslandGuest,
  IslandHandle,
  IslandInputOwner,
  IslandOutputOwner,
  IslandSizeOwner,
} from "@silvery/ag/island-types"
import { run } from "../../packages/ag-term/src/runtime/run"

// ---------------------------------------------------------------------------
// Input-capable guest that records the raw bytes it is fed
// ---------------------------------------------------------------------------

function createInputRecorderGuest(): { guest: IslandGuest; feeds: string[] } {
  const feeds: string[] = []
  const decoder = new TextDecoder()
  const guest: IslandGuest = {
    capabilities: { input: true },
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
      const handle: IslandHandle = { size, output, input, dispose: () => {} }
      ctx.emit({ type: "ready" })
      return Promise.resolve(handle)
    },
  }
  return { guest, feeds }
}

async function settle(ms = 30): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Key reservation
// ---------------------------------------------------------------------------

describe("island reserved input — keys", () => {
  test("reserveInput=Ctrl-G: the key falls through to the host useInput; the guest never sees it", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()
    const hostKeys: string[] = []

    function App(): React.ReactElement {
      useInput((input, key) => {
        if (key.ctrl && input === "g") hostKeys.push("ctrl-g")
      })
      return (
        <Box flexDirection="column">
          <Island
            guest={recorder.guest}
            cols={10}
            rows={2}
            focusable
            reserveInput={(input, key) => key.ctrl && input === "g"}
          />
          <Text>after</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term)
    try {
      // Tab → focus the island. From here the island captures input.
      await handle.press("Tab")

      // A normal key is forwarded to the guest (passthrough still works).
      await handle.press("a")
      await settle()
      expect(recorder.feeds).toEqual(["a"])

      // The reserved key must NOT reach the guest …
      await handle.press("Control+g")
      await settle()
      expect(recorder.feeds).toEqual(["a"])
      // … and MUST reach the host's useInput.
      expect(hostKeys).toEqual(["ctrl-g"])
    } finally {
      handle.unmount()
    }
  })

  test("no reserveInput: every key (including Ctrl-G) is forwarded to the guest (regression guard)", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()
    const hostKeys: string[] = []

    function App(): React.ReactElement {
      useInput((input, key) => {
        if (key.ctrl && input === "g") hostKeys.push("ctrl-g")
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
      await handle.press("Control+g")
      await settle()
      // Ctrl-G encodes as BEL (0x07); the guest captured it, host did not.
      expect(recorder.feeds.join("")).toContain("\x07")
      expect(hostKeys).toEqual([])
    } finally {
      handle.unmount()
    }
  })
})

// ---------------------------------------------------------------------------
// Mouse reservation
// ---------------------------------------------------------------------------

describe("island reserved input — mouse", () => {
  test("reserveMouse: a click inside the island rect is NOT SGR-fed to the guest; the host onClick still fires", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()
    const clicks: Array<{ x: number; y: number }> = []

    const handle = await run(
      // The wrapper's onClick is the host's pane-switch seam: DOM dispatch
      // bubbles the click target→root, so a click on an island cell fires it.
      <Box onClick={(e) => clicks.push({ x: e.x, y: e.y })}>
        <Island guest={recorder.guest} cols={10} rows={3} focusable reserveMouse={() => true} />
      </Box>,
      term,
      { mouse: true } as never,
    )
    try {
      await handle.press("Tab") // focus the island
      await term.mouse.click(3, 1) // inside the 10x3 island at the origin
      await settle()

      // Guest must NOT have been SGR-fed the click …
      expect(recorder.feeds.join("")).not.toContain("\x1b[<")
      // … and the host's onClick must have fired.
      expect(clicks.length).toBeGreaterThan(0)
    } finally {
      handle.unmount()
    }
  })

  test("no reserveMouse: a click inside the island rect IS SGR-fed to the guest (regression guard)", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()

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
      // The guest received the island-local SGR click (down + up).
      expect(recorder.feeds).toContain("\x1b[<0;4;2M")
      expect(recorder.feeds).toContain("\x1b[<0;4;2m")
    } finally {
      handle.unmount()
    }
  })
})
