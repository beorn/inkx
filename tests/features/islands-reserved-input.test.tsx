/**
 * <Island> host command-prefix + mode-aware mouse routing.
 *
 * A focused input-capable island forwards keys/mouse to its guest (see
 * `routeKeyToFocusedIsland` / `routeMouseToFocusedIsland` in
 * `packages/ag-term/src/runtime/event-handlers.ts`). Two host needs:
 *
 * 1. COMMAND PREFIX (tmux model). A multi-pane host (e.g. the hab "deck" shell
 *    pane) reserves a single prefix hotkey — `Ctrl-G` — plus, while it is
 *    mid-command (a chord is pending), the immediate follow-up keys. Those keys
 *    must reach the host's own `useInput` instead of the guest.
 *    `<Island commandPrefix={{ hotkey, capturing }}>`:
 *      - `hotkey` — the always-reserved prefix (matched via `matchHotkey`).
 *      - `reservedHotkeys` — additional always-reserved direct host hotkeys.
 *      - `capturing` — host is mid-command; route ALL keys to the host until it
 *        clears (the deck passes its `chordPending` flag).
 *
 * 2. MODE-AWARE MOUSE. A guest that has NOT enabled mouse reporting (no DECSET
 *    1000/1002/1003) does not want mouse events — forwarding SGR to it just
 *    makes it echo garbage. The host should only feed mouse to the guest when
 *    the guest's island mode state requests mouse tracking; otherwise the event
 *    falls through to the host mouse path (DOM `onClick` + app handlers) for
 *    pane switching. This is a correctness fix, not a public API.
 *
 * Harness mirrors islands-input-routing.test.tsx: the REAL `run()` runtime over
 * `createTermless`, keys via `handle.press()`, mouse via `term.mouse.click()`.
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
  IslandModesOwner,
  IslandOutputOwner,
  IslandProtocolModes,
  IslandSizeOwner,
} from "@silvery/ag/island-types"
import { run } from "../../packages/ag-term/src/runtime/run"

// ---------------------------------------------------------------------------
// Input-capable guest that records the raw bytes it is fed. Optionally declares
// a fixed mouse-tracking mode via the IslandModesOwner (capabilities.modes).
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Command prefix (keyboard)
// ---------------------------------------------------------------------------

describe("island autofocus — keys", () => {
  test("autoFocus focuses the Island node so the first plain key feeds the guest", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()

    function App(): React.ReactElement {
      return (
        <Box flexDirection="column">
          <Island guest={recorder.guest} cols={10} rows={2} focusable autoFocus />
          <Text>after</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term)
    try {
      await settle()
      await handle.press("A")
      expect(recorder.feeds.join("")).toBe("A")
    } finally {
      handle.unmount()
    }
  })
})

describe("island command prefix — keys", () => {
  test("commandPrefix=ctrl+g (capturing=false): the prefix falls through to the host; the guest never sees it; other keys still feed the guest", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()
    const hostKeys: string[] = []

    function App(): React.ReactElement {
      useInput((input, key) => {
        if (key.ctrl && input === "g") hostKeys.push("ctrl-g")
        else hostKeys.push(input)
      })
      return (
        <Box flexDirection="column">
          <Island
            guest={recorder.guest}
            cols={10}
            rows={2}
            focusable
            commandPrefix={{ hotkey: "ctrl+g", capturing: false }}
          />
          <Text>after</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term)
    try {
      // Tab → focus the island. From here the island captures input.
      await handle.press("Tab")

      // A normal key is forwarded to the guest (passthrough still works) and
      // does NOT reach the host (the guest owns it).
      await handle.press("a")
      await settle()
      expect(recorder.feeds).toEqual(["a"])
      expect(hostKeys).toEqual([])

      // The prefix must NOT reach the guest …
      await handle.press("Control+g")
      await settle()
      expect(recorder.feeds).toEqual(["a"])
      // … and MUST reach the host's useInput.
      expect(hostKeys).toEqual(["ctrl-g"])
    } finally {
      handle.unmount()
    }
  })

  test("commandPrefix capturing=true: while mid-command, even a normal key routes to the host", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()
    const hostKeys: string[] = []

    function App(): React.ReactElement {
      useInput((input) => {
        hostKeys.push(input)
      })
      return (
        <Box flexDirection="column">
          <Island
            guest={recorder.guest}
            cols={10}
            rows={2}
            focusable
            commandPrefix={{ hotkey: "ctrl+g", capturing: true }}
          />
          <Text>after</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term)
    try {
      await handle.press("Tab")
      // capturing=true: the host is mid-chord, so a plain "x" reaches the host
      // and is NOT fed to the guest.
      await handle.press("x")
      await settle()
      expect(recorder.feeds).toEqual([])
      expect(hostKeys).toEqual(["x"])
    } finally {
      handle.unmount()
    }
  })

  test("commandPrefix reservedHotkeys: direct host shortcuts fall through while other keys still feed the guest", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()
    const hostKeys: string[] = []

    function App(): React.ReactElement {
      useInput((input, key) => {
        if (key.meta && input === "h") hostKeys.push("meta-h")
        else if (key.meta && key.leftArrow) hostKeys.push("meta-left")
        else hostKeys.push(input)
      })
      return (
        <Box flexDirection="column">
          <Island
            guest={recorder.guest}
            cols={10}
            rows={2}
            focusable
            commandPrefix={{
              hotkey: "ctrl+g",
              capturing: false,
              reservedHotkeys: ["Meta+h", "Meta+ArrowLeft"],
            }}
          />
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
      expect(hostKeys).toEqual([])

      await handle.press("Meta+h")
      await handle.press("Meta+ArrowLeft")
      await settle()
      expect(recorder.feeds, "reserved direct host hotkeys do not feed the guest").toEqual(["a"])
      expect(hostKeys).toEqual(["meta-h", "meta-left"])

      await handle.press("b")
      await settle()
      expect(recorder.feeds, "non-reserved keys still feed the focused island").toEqual(["a", "b"])
      expect(hostKeys).toEqual(["meta-h", "meta-left"])
    } finally {
      handle.unmount()
    }
  })

  test("focusable=false severs stale focused-island keyboard routing after a host focus handoff", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()
    const hostKeys: string[] = []

    function App(): React.ReactElement {
      const [shellFocused, setShellFocused] = React.useState(true)
      useInput((input, key) => {
        if (key.ctrl && input === "g") {
          hostKeys.push("ctrl-g")
          setShellFocused(false)
          return
        }
        hostKeys.push(input)
      })
      return (
        <Box flexDirection="column">
          <Island
            guest={recorder.guest}
            cols={10}
            rows={2}
            focusable={shellFocused}
            commandPrefix={{ hotkey: "ctrl+g", capturing: false }}
          />
          <Text>host pane</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term)
    try {
      await handle.press("Tab")

      await handle.press("a")
      await settle()
      expect(recorder.feeds).toEqual(["a"])
      expect(hostKeys).toEqual([])

      await handle.press("Control+g")
      await settle()
      expect(hostKeys).toEqual(["ctrl-g"])

      await handle.press("b")
      await settle()
      expect(
        recorder.feeds,
        "a stale active island whose focusable prop is now false must not receive keys",
      ).toEqual(["a"])
      expect(hostKeys).toEqual(["ctrl-g", "b"])
    } finally {
      handle.unmount()
    }
  })

  test("no commandPrefix: every key (including Ctrl-G) is forwarded to the guest (regression guard)", async () => {
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

  test("Cmd/Super + C/V/X are host clipboard chords: reserved for the host, never re-encoded to the guest pty", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    const recorder = createInputRecorderGuest()
    const hostKeys: string[] = []
    const sendInput = (s: string): void =>
      (term as unknown as { sendInput: (s: string) => void }).sendInput(s)

    function App(): React.ReactElement {
      useInput((input, key) => {
        hostKeys.push(key.super ? `super-${input}` : input)
      })
      // No commandPrefix: only the universal clipboard-chord reservation applies.
      return (
        <Box flexDirection="column">
          <Island guest={recorder.guest} cols={10} rows={2} focusable />
          <Text>after</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term)
    try {
      await handle.press("Tab") // focus the island
      await handle.press("a")
      await settle()
      expect(recorder.feeds, "a normal key still feeds the focused guest").toEqual(["a"])

      // Cmd-C (99), Cmd-V (118), Cmd-X (120): Kitty CSI-u, modifier 9 = super(8)+1.
      // A real terminal intercepts these for the OS clipboard and never forwards
      // them to the pty, so they must be reserved for the host.
      sendInput("\x1b[99;9u")
      sendInput("\x1b[118;9u")
      sendInput("\x1b[120;9u")
      await settle()

      expect(recorder.feeds, "Cmd-C/V/X must NOT be re-encoded to the guest pty").toEqual(["a"])
      expect(hostKeys, "clipboard chords fall through to the host useInput").toEqual([
        "super-c",
        "super-v",
        "super-x",
      ])
    } finally {
      handle.unmount()
    }
  })
})

// ---------------------------------------------------------------------------
// Bracketed-paste routing to the focused guest
// ---------------------------------------------------------------------------

describe("island bracketed-paste routing", () => {
  test("bracketed-paste ON: pasted text routes to the focused guest re-wrapped in \\x1b[200~/\\x1b[201~", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    // Guest enables bracketed-paste mode (DECSET 2004), exactly as a shell line
    // editor (zsh/bash readline) does at its prompt.
    const recorder = createInputRecorderGuest({ modes: { bracketedPaste: true } })
    const sendInput = (s: string): void =>
      (term as unknown as { sendInput: (s: string) => void }).sendInput(s)

    function App(): React.ReactElement {
      return (
        <Box flexDirection="column">
          <Island guest={recorder.guest} cols={10} rows={2} focusable />
          <Text>after</Text>
        </Box>
      )
    }

    const handle = await run(<App />, term)
    try {
      await handle.press("Tab") // focus the island
      // The terminal's own Cmd-V emits bracketed-paste bytes; the host parser
      // strips the markers, and the runtime re-wraps them for a guest that
      // enabled DECSET 2004 so its line editor sees one atomic paste.
      sendInput("\x1b[200~PASTED\x1b[201~")
      await settle()
      expect(
        recorder.feeds.join(""),
        "a focused guest with bracketed-paste ON must receive the paste wrapped in DECSET 2004 markers",
      ).toBe("\x1b[200~PASTED\x1b[201~")
    } finally {
      handle.unmount()
    }
  })

  test("bracketed-paste OFF: pasted text routes to the focused guest as raw text (no markers)", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    // Guest declares modes but has NOT enabled bracketed paste → raw feed,
    // mirroring a terminal that forwards a paste as plain typed input to a pty
    // whose app never requested DECSET 2004.
    const recorder = createInputRecorderGuest({ modes: { bracketedPaste: false } })
    const sendInput = (s: string): void =>
      (term as unknown as { sendInput: (s: string) => void }).sendInput(s)

    function App(): React.ReactElement {
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
      sendInput("\x1b[200~PASTED\x1b[201~")
      await settle()
      const fed = recorder.feeds.join("")
      expect(
        fed,
        "a focused guest with bracketed-paste OFF still receives the paste as raw typed text",
      ).toContain("PASTED")
      expect(
        fed,
        "bracketed-paste markers must NOT be sent to a guest that did not enable DECSET 2004",
      ).not.toContain("\x1b[200~")
    } finally {
      handle.unmount()
    }
  })
})

// ---------------------------------------------------------------------------
// Mode-aware mouse routing
// ---------------------------------------------------------------------------

describe("island mode-aware mouse routing", () => {
  test("guest mouse mode OFF: a click inside the island is NOT fed to the guest; the host onClick fires", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    // Guest declares modes but does NOT request mouse tracking → mouse OFF.
    const recorder = createInputRecorderGuest({ modes: { mouseTracking: "off" } })
    const clicks: Array<{ x: number; y: number }> = []

    const handle = await run(
      // The wrapper's onClick is the host's pane-switch seam: DOM dispatch
      // bubbles the click target→root, so a click on an island cell fires it.
      <Box onClick={(e) => clicks.push({ x: e.x, y: e.y })}>
        <Island guest={recorder.guest} cols={10} rows={3} focusable />
      </Box>,
      term,
      { mouse: true } as never,
    )
    try {
      await handle.press("Tab") // focus the island
      await term.mouse.click(3, 1) // inside the 10x3 island at the origin
      await settle()

      // Guest must NOT have been SGR-fed the click (no mouse mode) …
      expect(recorder.feeds.join("")).not.toContain("\x1b[<")
      // … and the host's onClick must have fired.
      expect(clicks.length).toBeGreaterThan(0)
    } finally {
      handle.unmount()
    }
  })

  test("guest mouse mode ON: a click inside the island IS fed to the guest", async () => {
    using term = createTermless({ cols: 40, rows: 8 })
    // Guest requests "any" mouse tracking → mouse ON.
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
      // The guest received the island-local SGR click (down + up).
      expect(recorder.feeds).toContain("\x1b[<0;4;2M")
      expect(recorder.feeds).toContain("\x1b[<0;4;2m")
    } finally {
      handle.unmount()
    }
  })
})
