/**
 * Defaults contract — `createApp()` + `.run()` (Layer 3 entry point).
 *
 * See tests/contracts/README.md for the convention.
 *
 * `createApp` is the provider/store-aware sibling of `run()`. `run()` is a
 * thin wrapper — it constructs an empty-store `createApp(() => () => ({}))`
 * and forwards `AppRunOptions`. The documented defaults of both surfaces must
 * therefore be in lockstep: if a default drifts on one side, the other
 * inherits the bug.
 *
 * Seed row in this file: the selection/mouse coupling, exercised directly
 * against `createApp().run(<App/>, { ..., mouse: true })` with a termless-
 * backed Term via `run()`'s Term path (which internally calls createApp).
 *
 * The other two seeds (FORCE_COLOR, click-vs-drag) are not `createApp`-
 * specific — they live in `run-defaults.contract.test.tsx`. We keep this
 * file small and let it grow in Phase 2 with createApp-specific defaults
 * (virtualInline, alternateScreen, kittyMode, provider wiring).
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { EventEmitter } from "node:events"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"

import { Box, Text } from "../../src/index.js"
import { run } from "../../packages/ag-term/src/runtime/run"
import { createApp } from "../../packages/ag-term/src/runtime/create-app"

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms))

// SGR mouse-tracking enable (`enableMouse()` emits `?1003h?1006h`); `?1006h`
// is the stable marker. `?1007l` disables alternate-scroll (the mouse-off
// wheel-jump defense).
const MOUSE_ENABLE = "?1006h"
const ALT_SCROLL_OFF = "?1007l"

/**
 * A mock TTY stdout that captures every byte written. A plain `writable` sink
 * would flip `initApp` into headless mode (which skips ALL terminal-protocol
 * setup — alt screen, mouse, 1007), so byte-level default assertions need a
 * non-headless TTY-shaped stream instead. Mirrors the helper in
 * tests/features/inline-mouse-default.test.tsx.
 */
function createMockStdout(cols = 40, rows = 10) {
  const chunks: string[] = []
  const emitter = new EventEmitter()
  const mock = Object.create(emitter)
  mock.columns = cols
  mock.rows = rows
  mock.isTTY = true
  mock.writable = true
  mock.fd = 1
  mock.write = (data: string | Uint8Array) => {
    chunks.push(typeof data === "string" ? data : new TextDecoder().decode(data))
    return true
  }
  mock.end = () => {}
  mock.destroy = () => {}
  mock.on = emitter.on.bind(emitter)
  mock.off = emitter.off.bind(emitter)
  mock.once = emitter.once.bind(emitter)
  mock.emit = emitter.emit.bind(emitter)
  mock.removeListener = emitter.removeListener.bind(emitter)
  mock.addListener = emitter.addListener.bind(emitter)
  return {
    stream: mock as NodeJS.WriteStream,
    get output() {
      return chunks.join("")
    },
  }
}

function createMockStdin() {
  const emitter = new EventEmitter()
  const mock = Object.create(emitter)
  mock.isTTY = true
  mock.isRaw = false
  mock.fd = 0
  mock.setRawMode = (m: boolean) => {
    mock.isRaw = m
    return mock
  }
  mock.read = () => null
  mock.resume = () => mock
  mock.pause = () => mock
  mock.ref = () => mock
  mock.unref = () => mock
  mock.setEncoding = () => mock
  mock.on = emitter.on.bind(emitter)
  mock.off = emitter.off.bind(emitter)
  mock.once = emitter.once.bind(emitter)
  mock.emit = emitter.emit.bind(emitter)
  mock.removeListener = emitter.removeListener.bind(emitter)
  mock.addListener = emitter.addListener.bind(emitter)
  return mock as NodeJS.ReadStream
}

/** Call `createApp().run()` DIRECTLY (bypassing run(), which masks createApp's
 *  own mouse default by always passing an explicit resolved `mouse`). */
async function runCreateAppDirect(
  element: React.ReactElement,
  opts: { alternateScreen?: boolean; mouse?: boolean },
): Promise<string> {
  const stdout = createMockStdout()
  const stdin = createMockStdin()
  const app = createApp(() => () => ({}))
  const handle = await app.run(element, {
    stdout: stdout.stream,
    stdin,
    cols: 40,
    rows: 10,
    kitty: false,
    focusReporting: false,
    ...opts,
  })
  await settle(50)
  handle.unmount()
  return stdout.output
}

function SelectableContent() {
  return (
    <Box flexDirection="column">
      <Text>Hello World of Selection</Text>
      <Text>Second row here</Text>
    </Box>
  )
}

// ============================================================================
// Seed — selection defaults to true when mouse: true is passed (createApp path)
// ============================================================================
//
// `run(<App/>, term, opts)` (Term path, run.tsx:237) instantiates
// `createApp(() => () => ({}))` and forwards `opts` as `AppRunOptions`. This
// test exercises the same default-resolution code as the run-defaults file,
// but through the `createApp().run()` composition — catching drift between
// the two surfaces.

describe("contract: createApp AppRunOptions.selection", () => {
  test("contract: selection defaults to true when mouse: true (createApp composition)", async () => {
    using term = createTermless({ cols: 40, rows: 5 })

    // Routes through createApp() internally — see run.tsx:294-306.
    const handle = await run(<SelectableContent />, term, { mouse: true })
    await settle()
    term.clipboard.clear()

    await term.mouse.drag({ from: [0, 0], to: [10, 0] })
    await settle(200)

    expect(term.clipboard.last).not.toBeNull()
    expect(term.clipboard.last!.length).toBeGreaterThan(0)

    handle.unmount()
  })

  test("contract: explicit selection: false disables even when mouse: true", async () => {
    using term = createTermless({ cols: 40, rows: 5 })

    const handle = await run(<SelectableContent />, term, {
      mouse: true,
      selection: false,
    })
    await settle()
    term.clipboard.clear()

    await term.mouse.drag({ from: [0, 0], to: [10, 0] })
    await settle(200)

    // Opt-out wins — OSC 52 must stay silent.
    expect(term.clipboard.last).toBeNull()

    handle.unmount()
  })
})

// ============================================================================
// mouse default follows alternateScreen (createApp direct path)
// ============================================================================
//
// `run()` masks createApp's own mouse default by always forwarding an explicit
// resolved `mouse`. Called directly, createApp must default `mouse` to the
// alternate-screen mode — ON in fullscreen, OFF inline — mirroring run()'s
// `mode !== "inline"` rule. Before the fix createApp hardcoded `mouse: false`,
// so `createApp().run({ alternateScreen: true })` sat on the alt screen with
// mouse tracking OFF; terminals then translated wheel to arrow keys and "the
// wheel moved the cursor". These assert the raw protocol bytes.

describe("contract: createApp mouse default follows alternateScreen", () => {
  test("contract: fullscreen (alternateScreen: true) enables mouse by default", async () => {
    const out = await runCreateAppDirect(<SelectableContent />, { alternateScreen: true })
    expect(out).toContain(MOUSE_ENABLE)
    // Mouse is on, so the alternate-scroll defense must NOT fire.
    expect(out).not.toContain(ALT_SCROLL_OFF)
  })

  test("contract: inline (alternateScreen: false) leaves mouse off by default", async () => {
    const out = await runCreateAppDirect(<SelectableContent />, { alternateScreen: false })
    expect(out).not.toContain(MOUSE_ENABLE)
    // Not on the alt screen → no 1007 defense either.
    expect(out).not.toContain(ALT_SCROLL_OFF)
  })

  test("contract: explicit mouse: true wins over the inline default", async () => {
    const out = await runCreateAppDirect(<SelectableContent />, {
      alternateScreen: false,
      mouse: true,
    })
    expect(out).toContain(MOUSE_ENABLE)
  })

  test("contract: explicit mouse: false on the alt screen emits ?1007l (alternate-scroll off)", async () => {
    const out = await runCreateAppDirect(<SelectableContent />, {
      alternateScreen: true,
      mouse: false,
    })
    // Explicit opt-out wins: no mouse tracking...
    expect(out).not.toContain(MOUSE_ENABLE)
    // ...but the framework disables alternate-scroll so the wheel is a no-op
    // instead of translating to cursor keys.
    expect(out).toContain(ALT_SCROLL_OFF)
  })
})

// ============================================================================
// Alternate-scroll defense over the injected-term modes path (run() + termless)
// ============================================================================
//
// The direct tests above exercise the standalone `createModes()`. run() with a
// Term injects `term.modes`, so this pins that `disableAlternateScroll()` also
// reaches the injected owner end-to-end.

describe("contract: alternate-scroll defense via run() + injected term", () => {
  test("contract: fullscreen + mouse: false emits ?1007l to the terminal", async () => {
    using term = createTermless({ cols: 40, rows: 5 })
    const handle = await run(<SelectableContent />, term, { mouse: false })
    await settle()
    const out = term.out.getText()
    expect(out).toContain(ALT_SCROLL_OFF)
    expect(out).not.toContain(MOUSE_ENABLE)
    handle.unmount()
  })

  test("contract: fullscreen default (mouse on) does NOT emit ?1007l", async () => {
    using term = createTermless({ cols: 40, rows: 5 })
    const handle = await run(<SelectableContent />, term)
    await settle()
    const out = term.out.getText()
    expect(out).toContain(MOUSE_ENABLE)
    expect(out).not.toContain(ALT_SCROLL_OFF)
    handle.unmount()
  })
})

// ============================================================================
// Phase 2 backlog — createApp-specific defaults still to cover
// ============================================================================
//
// These defaults are owned by `AppRunOptions` in create-app.tsx and are NOT
// exercised by `run()`-only tests. They each need their own contract once
// Phase 2 lands.
//
// - `alternateScreen` — default: false (createApp direct); run() sets true via mode.
// - `virtualInline` — default: false
// - `kittyMode` / `kitty` — default: auto
// - `suspendOnCtrlZ` — default: true
// - `exitOnCtrlC` — default: true
// - `guardOutput` — default: true (critical — disabling without knowing it
//   breaks alt-screen isolation; run() sets false for emulator-backed terms)
// - Provider composition defaults (withFocus, withDomEvents wiring) — see
//   runtime/with-*.ts files.
//
// TODO (Phase 2 bead km-silvery.defaults-contract-tests): port each above to
// a contract test. Some will need to call createApp() directly with a wired
// mock stdin/stdout because run() masks them.
