/**
 * Regression test for the 10-second blank-screen bug at silvercode startup.
 *
 * Symptom: launching `silvercode` rendered a blank terminal for ~10 seconds
 * before the UI appeared. Forensic analysis (user logs at /tmp/silvercode-*.log)
 * showed `App:firstCommit` firing at ~228ms but `claude-version probed`
 * deferred until ~10s later. The cause was that App rendered NOTHING useful
 * until the initial spawn microtask resolved a SessionHandle into the
 * `sessions[]` state — both SidePanel and PaneGrid early-returned empty.
 *
 * Fix:
 *   - SidePanel renders skeleton chrome when focused === undefined.
 *   - PaneGrid renders a "Spawning session…" placeholder when sessions=[].
 *   - App.tsx unconditionally mounts SidePanel.
 *   - claude-version.ts eagerly fires the probe at module-eval.
 *
 * Bead: km-silvercode.sidepanel-skeleton-mount.
 *
 * Test approach
 * -------------
 * Pass `spawnFactory: () => never-resolving-promise` so the controller's
 * initial spawn microtask never settles. `sessions[]` stays empty for the
 * entire render — exactly the user's first ~228ms-to-spawn window.
 *
 * The render harness flushes microtasks but a never-resolving promise will
 * never enqueue. Without the fix the entire frame would be empty whitespace;
 * with the fix the user sees structure (sessions list, mode label, branding,
 * spawning placeholder) immediately.
 */

import { expect, test } from "vitest"
import React from "react"
import { createRenderer } from "@silvery/test"
import { ScopeProvider } from "@silvery/ag-react"
import { createScope } from "@silvery/scope"
import { App } from "../src/App.tsx"
import { installFakes } from "../src/test/fake-boundaries.ts"

test("App renders useful structure before the first session spawns (regression: km-silvercode.sidepanel-skeleton-mount)", async () => {
  const fakes = installFakes({})
  const cols = 120
  const rows = 40

  const prevCols = process.stdout.columns
  const prevRows = process.stdout.rows
  Object.defineProperty(process.stdout, "columns", { configurable: true, get: () => cols })
  Object.defineProperty(process.stdout, "rows", { configurable: true, get: () => rows })

  // The factory returns a promise that never resolves. The controller awaits
  // the factory before pushing into sessions[], so the in-flight spawn keeps
  // sessions=[] for the duration of this render. Mirrors the exact startup
  // window the user saw as ~10s of blank screen.
  const neverResolves: Promise<never> = new Promise<never>(() => {})
  const spawnFactory = (): Promise<never> => neverResolves

  const renderer = createRenderer({ cols, rows })
  const scope = createScope("empty-state-render-test")
  const tree = (
    <ScopeProvider scope={scope} appScope={scope}>
      <App
        cwd="/tmp/silvercode-test"
        bare={true}
        layout="single"
        model="claude-sonnet-4-6"
        spawnFactory={spawnFactory}
      />
    </ScopeProvider>
  )
  const app = renderer(tree)

  // Flush microtasks. Even with these flushes, neverResolves stays pending,
  // so sessions[] stays empty and focused stays undefined throughout.
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
  }
  renderer(tree)
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }

  Object.defineProperty(process.stdout, "columns", { configurable: true, value: prevCols })
  Object.defineProperty(process.stdout, "rows", { configurable: true, value: prevRows })

  const text = app.text

  // SidePanel mounted: the mode label is visible. Without the fix, the
  // `focused ? <SidePanel /> : null` gate meant nothing rendered.
  expect(text).toContain("auto mode on")

  // SidePanel mounted: branding row is visible. Proves the version block
  // renders even before any session-init event fills state.claudeCodeVersion.
  expect(text).toContain("Silver")
  expect(text).toContain("Claude Code")

  // PaneGrid mounted with the empty-sessions placeholder — the SILVER CODE
  // figlet banner. Without the fix the whole left column was a 10-line
  // gap of blank space. The banner's unique signature "_____ _____ _ __"
  // is the figlet Big "SILVER" top row and only appears inside the
  // brand banner.
  expect(text).toMatch(/ ░░░░░░  ░░░░/)

  // Belt-and-suspenders: the rendered text has substantial content. The
  // original bug rendered ONLY the alt-screen background; a real frame
  // pushes well past 100 non-whitespace chars.
  expect(text.replace(/\s+/g, "").length).toBeGreaterThan(100)

  fakes.dispose()
})
