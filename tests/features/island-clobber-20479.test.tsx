/**
 * 20479 — behavioral RED→GREEN isolating the focus-clears-on-non-focusable fix.
 *
 * The 17918806 mitigation ("ignore stale non-focusable island focus") makes KEY
 * DISPATCH route past a stale Island, so key-routing tests are GREEN on clean
 * source and cannot isolate the fix. PROTOCOL-MODE aggregation is different: the
 * host aggregates protocol modes from the FOCUSED island subtree (island-types
 * "modes released when the island loses focus"; STRICT slug `island-mode-leak`).
 * That aggregation keys off the focus-manager's focused signal — which only the
 * fix's `handleNodeUpdated` syncs when an Island flips focusable true→false while
 * staying mounted. So the mode-leak observable is NOT masked by the dispatch
 * mitigation: on clean source the flipped-non-focusable island's modes stay
 * enabled (leak); with the fix they are disabled.
 */

import React from "react"
import { EventEmitter } from "node:events"
import { closeSync, openSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { Box, Island, Text } from "@silvery/ag-react"
import { createCellBuffer } from "@silvery/ag/viewport-buffer"
import { run } from "../../packages/ag-term/src/runtime/run"
import type {
  IslandGuest,
  IslandHandle,
  IslandModesOwner,
  IslandProtocolModes,
} from "@silvery/ag/island-types"

const MOUSE_ENABLE_RE = /\x1b\[\?(?:1000|1002|1003|1006|1016)h/
const MOUSE_DISABLE_RE = /\x1b\[\?(?:1000|1002|1003|1006|1016)l/
const FOCUS_ENABLE_RE = /\x1b\[\?1004h/
const FOCUS_DISABLE_RE = /\x1b\[\?1004l/

function createFakeTtyStdin(): { stream: NodeJS.ReadStream } {
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
  return { stream: out }
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

function createModeGuest(initialModes: IslandProtocolModes): { guest: IslandGuest } {
  const modes = initialModes
  const buffer = createCellBuffer(1, 1)
  const modesOwner: IslandModesOwner = {
    get modes() {
      return modes
    },
    subscribe: () => () => {},
  }
  const guest: IslandGuest = {
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
  return { guest }
}

function clearWrites(stdout: { written: string[] }): void {
  stdout.written.length = 0
}

describe("island focusable flip clears focus + releases protocol modes (20479)", () => {
  test("flipping a focused island NON-FOCUSABLE (still mounted) releases its host protocol modes", async () => {
    const { stream: stdin } = createFakeTtyStdin()
    const stdout = createFakeTtyStdout()
    const modeGuest = createModeGuest({ mouseTracking: "any", focusReporting: true })
    // Ref-like holder so the test body can drive the component's setter. A plain
    // closure-assigned `let` narrows to `null` at the call site (CFA never), so
    // capture through a holder whose property carries the union type.
    const focusableSetter: { current: React.Dispatch<React.SetStateAction<boolean>> | null } = {
      current: null,
    }

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
          <Island guest={modeGuest.guest} cols={1} rows={1} focusable={focusable} />
          <Box testID="after" focusable>
            <Text>after</Text>
          </Box>
        </Box>
      )
    }

    const handle = await run(<App />, {
      stdin,
      stdout,
      cols: 80,
      rows: 24,
      mode: "inline",
      input: false,
      kitty: false,
      mouse: false,
      focusReporting: false,
      selection: false,
    })

    try {
      // Focus the island → it requests mouse + focus-reporting protocol modes.
      await handle.press("Tab")
      const enabled = stdout.written.join("")
      expect(MOUSE_ENABLE_RE.test(enabled), "focused island enables mouse mode").toBe(true)
      expect(FOCUS_ENABLE_RE.test(enabled), "focused island enables focus-reporting").toBe(true)

      // Flip the island NON-FOCUSABLE while it stays mounted. The fix's
      // handleNodeUpdated must clear the now-non-focusable island's focus so the
      // host re-aggregates and RELEASES the island-only protocol modes.
      clearWrites(stdout)
      focusableSetter.current?.(false)
      await new Promise<void>((r) => setTimeout(r, 30))
      const afterFlip = stdout.written.join("")
      expect(
        MOUSE_DISABLE_RE.test(afterFlip),
        `flipping the island non-focusable must DISABLE its mouse mode (no leak). ` +
          `afterFlip=${JSON.stringify(afterFlip)}`,
      ).toBe(true)
      expect(
        FOCUS_DISABLE_RE.test(afterFlip),
        `flipping the island non-focusable must DISABLE its focus-reporting (no leak). ` +
          `afterFlip=${JSON.stringify(afterFlip)}`,
      ).toBe(true)
    } finally {
      handle.unmount()
      stdout.closeFd()
    }
  })

  test("CLOBBER: with a 2nd render root mounted, flipping root A's island non-focusable still releases A's modes and leaves B's intact", async () => {
    // The deck shape: a 2nd render root (B) is mounted (the nested-guest clobber
    // trigger under the old process-global lifecycle model). Root A's focused
    // island must STILL get its focus cleared (and modes released) on a
    // focusable flip — routed to A's own focus manager, not lost to B's clobber.
    const stdinA = createFakeTtyStdin().stream
    const stdoutA = createFakeTtyStdout()
    const stdinB = createFakeTtyStdin().stream
    const stdoutB = createFakeTtyStdout()
    const guestA = createModeGuest({ mouseTracking: "any", focusReporting: true })
    const guestB = createModeGuest({ mouseTracking: "any", focusReporting: true })
    // Ref-like holder (see test 1) so the body can flip root A's island.
    const focusableSetterA: { current: React.Dispatch<React.SetStateAction<boolean>> | null } = {
      current: null,
    }

    function AppA(): React.ReactElement {
      const [focusable, setF] = React.useState(true)
      React.useEffect(() => {
        focusableSetterA.current = setF
        return () => {
          focusableSetterA.current = null
        }
      }, [setF])
      return (
        <Box flexDirection="column">
          <Island guest={guestA.guest} cols={1} rows={1} focusable={focusable} />
          <Box testID="after-a" focusable>
            <Text>after-a</Text>
          </Box>
        </Box>
      )
    }
    function AppB(): React.ReactElement {
      return (
        <Box flexDirection="column">
          <Island guest={guestB.guest} cols={1} rows={1} focusable />
          <Box testID="after-b" focusable>
            <Text>after-b</Text>
          </Box>
        </Box>
      )
    }

    // `as const` keeps the literal types (notably `input: false`, which
    // RunOptionsCommon types as the literal `false`, not `boolean`) when spread.
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
    // Mount A first, then B — B's render() clobbers A's process-global lifecycle
    // callback under the unfixed model.
    const handleA = await run(<AppA />, { stdin: stdinA, stdout: stdoutA, ...baseOpts })
    const handleB = await run(<AppB />, { stdin: stdinB, stdout: stdoutB, ...baseOpts })
    try {
      await handleA.press("Tab")
      await handleB.press("Tab")
      expect(MOUSE_ENABLE_RE.test(stdoutA.written.join("")), "root A island enabled mouse").toBe(
        true,
      )
      expect(MOUSE_ENABLE_RE.test(stdoutB.written.join("")), "root B island enabled mouse").toBe(
        true,
      )

      // Flip ONLY root A's island non-focusable.
      clearWrites(stdoutA)
      clearWrites(stdoutB)
      focusableSetterA.current?.(false)
      await new Promise<void>((r) => setTimeout(r, 30))

      const afterA = stdoutA.written.join("")
      const afterB = stdoutB.written.join("")
      // Root A releases its modes (the fix routed the update to A's own focus manager).
      expect(
        MOUSE_DISABLE_RE.test(afterA),
        `root A must release its mouse mode on flip even with root B mounted. afterA=${JSON.stringify(afterA)}`,
      ).toBe(true)
      // Root B is untouched — no spurious disable bled across the render-root boundary.
      expect(
        MOUSE_DISABLE_RE.test(afterB),
        `root B's modes must NOT be disabled by root A's flip`,
      ).toBe(false)
    } finally {
      handleB.unmount()
      handleA.unmount()
      stdoutA.closeFd()
      stdoutB.closeFd()
    }
  })
})
