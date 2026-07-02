/**
 * island-mode-leak STRICT slug — no-false-positive gate on the REAL closure.
 *
 * `assertNoIslandModeLeak` (packages/ag-term/src/runtime/create-app.tsx) is the
 * self-consistency guard that runs at the tail of `applyFocusedIslandProtocolModes`:
 * after the host re-aggregates the focused island subtree's requested protocol
 * modes and drives the term mode setters, it asserts every term mode
 * (`modes.altScreen()`, `bracketedPaste()`, `kittyKeyboard()`, `mouse()`,
 * `focusReporting()`) now matches the freshly computed `desired`. It throws when
 * any mode "leaks" (stays on/off out of sync with the focused subtree).
 *
 * The closure is private and only reachable through the full non-headless
 * createApp → focus-change path, so it cannot be unit-called. This test drives
 * the real path via `run()` with a fake TTY (mirroring island-clobber-20479),
 * with `SILVERY_STRICT=island-mode-leak` enabled, and asserts the check runs
 * clean across a focus → blur(flip) → unmount lifecycle for an island that
 * requests ALL FIVE protocol modes. A regression that leaves a mode out of sync
 * on blur/unmount would trip the STRICT throw here.
 *
 * NOTE (fire-case gap): asserting the check FIRES for each mode would require
 * injecting a Term whose mode setters no-op (so actual diverges from desired).
 * `RunHandle` does not expose `term.modes`, and building a full fake Term is
 * both heavy and artificial. The gate-able fire test wants a tiny source seam —
 * extracting the pure comparison (create-app.tsx ~2330-2352) into an exported
 * `collectProtocolModeLeaks(actual, desired): string[]` helper, unit-tested like
 * the six sibling island slugs in strict-island.ts. See this worker's report.
 */

import React from "react"
import { EventEmitter } from "node:events"
import { closeSync, openSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { Box, Island, Text } from "@silvery/ag-react"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import { run } from "../../packages/ag-term/src/runtime/run"
import { resetStrictCache } from "../../packages/ag-term/src/strict-mode"
import type {
  IslandGuest,
  IslandHandle,
  IslandModesOwner,
  IslandProtocolModes,
} from "@silvery/ag/island-types"

const ALT_ENABLE_RE = /\x1b\[\?1049h/
const ALT_DISABLE_RE = /\x1b\[\?1049l/
const PASTE_ENABLE_RE = /\x1b\[\?2004h/
const PASTE_DISABLE_RE = /\x1b\[\?2004l/
const MOUSE_ENABLE_RE = /\x1b\[\?(?:1000|1002|1003|1006|1016)h/
const MOUSE_DISABLE_RE = /\x1b\[\?(?:1000|1002|1003|1006|1016)l/
const FOCUS_ENABLE_RE = /\x1b\[\?1004h/
const FOCUS_DISABLE_RE = /\x1b\[\?1004l/

let prevStrict: string | undefined

beforeEach(() => {
  prevStrict = process.env.SILVERY_STRICT
  // Enable ONLY the island-mode-leak slug — isolates the check under test from
  // the rest of the tier-2 umbrella (flicker / cursor / residue), which could
  // throw for unrelated reasons in this minimal app.
  process.env.SILVERY_STRICT = "island-mode-leak"
  resetStrictCache()
})

afterEach(() => {
  if (prevStrict === undefined) delete process.env.SILVERY_STRICT
  else process.env.SILVERY_STRICT = prevStrict
  resetStrictCache()
})

function createFakeTtyStdin(): NodeJS.ReadStream {
  const ee = new EventEmitter()
  const overrides = {
    isTTY: true as const,
    isRaw: false,
    fd: 0,
    read: (): null => null,
    resume: (): NodeJS.ReadStream => out,
    pause: (): NodeJS.ReadStream => out,
    ref: (): NodeJS.ReadStream => out,
    unref: (): NodeJS.ReadStream => out,
    setRawMode(mode: boolean): NodeJS.ReadStream {
      overrides.isRaw = mode
      return out
    },
    setEncoding: (): NodeJS.ReadStream => out,
  }
  const out = Object.assign(ee, overrides) as unknown as NodeJS.ReadStream
  return out
}

function createFakeTtyStdout(): NodeJS.WriteStream & { written: string[]; closeFd: () => void } {
  const ee = new EventEmitter()
  const written: string[] = []
  const fd = openSync("/dev/null", "w")
  const stream = Object.assign(ee, {
    isTTY: true as const,
    columns: 80,
    rows: 24,
    fd,
    written,
    closeFd() {
      closeSync(fd)
    },
    write(data?: string | Uint8Array): true {
      if (data != null)
        written.push(typeof data === "string" ? data : Buffer.from(data).toString("utf8"))
      return true
    },
  })
  return stream as unknown as NodeJS.WriteStream & { written: string[]; closeFd: () => void }
}

function createModeGuest(initialModes: IslandProtocolModes): IslandGuest {
  const modes = initialModes
  const buffer = createCellBuffer(1, 1)
  const modesOwner: IslandModesOwner = {
    get modes() {
      return modes
    },
    subscribe: () => () => {},
  }
  return {
    capabilities: { input: true, modes: true },
    init(ctx) {
      const handle: IslandHandle = {
        size: {
          get cols() {
            return ctx.cols
          },
          get rows() {
            return ctx.rows
          },
          subscribe: () => () => {},
          requestResize: () => {},
        },
        output: {
          buffer,
          cursor: null,
          cursorVisible: false,
          subscribe: () => () => {},
          writeCells: () => {},
          invalidateAll: () => {},
        },
        modes: modesOwner,
        dispose: () => {},
      }
      ctx.emit({ type: "ready" })
      return Promise.resolve(handle)
    },
  }
}

const baseOpts = {
  cols: 80,
  rows: 24,
  mode: "inline",
  input: false,
  kitty: false,
  mouse: false,
  focusReporting: false,
  selection: false,
} as const

describe("island-mode-leak STRICT slug — real-closure clean-path gate", () => {
  test("focus → blur(flip) → unmount stays consistent for all five protocol modes (no leak throw)", async () => {
    const stdin = createFakeTtyStdin()
    const stdout = createFakeTtyStdout()
    // Guest requests EVERY protocol mode the leak check compares.
    const guest = createModeGuest({
      altScreen: true,
      bracketedPaste: true,
      kittyKeyboard: true,
      mouseTracking: "any",
      focusReporting: true,
    })
    const focusableSetter: {
      current: React.Dispatch<React.SetStateAction<boolean>> | null
    } = { current: null }

    function App(): React.ReactElement {
      const [focusable, setF] = React.useState(true)
      React.useEffect(() => {
        focusableSetter.current = setF
        return () => {
          focusableSetter.current = null
        }
      }, [setF])
      return (
        <Box flexDirection="column">
          <Island guest={guest} cols={1} rows={1} focusable={focusable} />
          <Box testID="after" focusable>
            <Text>after</Text>
          </Box>
        </Box>
      )
    }

    // If assertNoIslandModeLeak trips at ANY focus recompute, the throw surfaces
    // synchronously through press()/the flip tick and rejects this test.
    const handle = await run(<App />, { stdin, stdout, ...baseOpts })
    try {
      // Focus the island → host aggregates + enables all requested modes; the
      // leak check runs at the tail of applyFocusedIslandProtocolModes and must
      // NOT throw (every mode now matches desired).
      await handle.press("Tab")
      const enabled = stdout.written.join("")
      expect(
        ALT_ENABLE_RE.test(enabled),
        `altScreen enable. enabled=${JSON.stringify(enabled)}`,
      ).toBe(true)
      expect(PASTE_ENABLE_RE.test(enabled), "bracketed-paste enable").toBe(true)
      expect(MOUSE_ENABLE_RE.test(enabled), "mouse enable").toBe(true)
      expect(FOCUS_ENABLE_RE.test(enabled), "focus-reporting enable").toBe(true)

      // Blur via focusable flip → host re-aggregates + releases the island-only
      // modes. The leak check runs again and must not throw (no stale mode).
      stdout.written.length = 0
      focusableSetter.current?.(false)
      await new Promise<void>((r) => setTimeout(r, 40))
      const afterBlur = stdout.written.join("")
      expect(
        ALT_DISABLE_RE.test(afterBlur),
        `altScreen must release on blur. afterBlur=${JSON.stringify(afterBlur)}`,
      ).toBe(true)
      expect(PASTE_DISABLE_RE.test(afterBlur), "bracketed-paste must release on blur").toBe(true)
      expect(MOUSE_DISABLE_RE.test(afterBlur), "mouse must release on blur").toBe(true)
      expect(FOCUS_DISABLE_RE.test(afterBlur), "focus-reporting must release on blur").toBe(true)
    } finally {
      // Unmount runs a final protocol teardown; the leak check must not throw.
      expect(() => handle.unmount()).not.toThrow()
      stdout.closeFd()
    }
  })
})
