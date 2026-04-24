/**
 * renderScenario — drive the real silvercode <App/> through a
 * ScriptedFakeSession, returning the rendered frame and handles.
 *
 * This is the Layer 4 harness. It uses the App's existing `spawnFactory`
 * prop so visual tests exercise the exact code path a real user hits,
 * minus the subprocess. No TestApp shim, no parallel implementation — if
 * App.tsx changes, tests pick it up.
 *
 * Backend: `createRenderer` from @silvery/test — synchronous, no xterm.js
 * allocation. That's sufficient for every v1 visual assertion (text
 * content, column alignment, cell color via `app.cell()`). Tests that
 * specifically need full ANSI processing can drop down to `createTermless`
 * via a separate helper; v1 doesn't need it.
 *
 * Usage
 * -----
 *
 *   const s = renderScenario({ script: helloWorld, cols: 120, rows: 30 })
 *   expect(s.text).toContain("Hi!")
 *   expectLayoutInvariants(s)
 *
 * The harness emits every event in `script` synchronously before returning,
 * so React has already reconciled the final frame. Tests asserting
 * in-between states can pass `autoEmit: false` and call `s.emit(event)`
 * manually.
 */

import type { AgentEvent } from "@km/agent-harness"
import React from "react"
import { createRenderer, type App as RendererApp } from "@silvery/test"
import { App } from "../App.tsx"
import { createFakeSession, type ScriptedFakeSession } from "./fake-session.ts"

export type RenderedScenario = {
  /** Normalized frame text (ANSI stripped, blank lines preserved — they ARE layout). */
  readonly text: string
  /** Frame as an array of lines. Length === `rows` unless the renderer trims trailing. */
  readonly lines: readonly string[]
  /** Frame width (cols). */
  readonly cols: number
  /** Frame height (rows). */
  readonly rows: number
  /** The underlying @silvery/test App — for cell-level color assertions. */
  readonly app: RendererApp
  /** The fake session wired into the app's controller. */
  readonly fake: ScriptedFakeSession
  /** Emit an additional event after the initial script finishes. */
  emit(event: AgentEvent): void
  /** Re-sample the frame after additional state changes. */
  resample(): { text: string; lines: readonly string[] }
}

export type RenderScenarioOptions = {
  /** The scripted events to emit in order before returning. */
  script: ReadonlyArray<AgentEvent>
  /** Terminal width in columns. Defaults to 120 (the "desktop" width we design for). */
  cols?: number
  /** Terminal height in rows. Defaults to 30. */
  rows?: number
  /** Layout mode for App. "single" is the default (matches normal usage). */
  layout?: "single" | "grid-2" | "grid-4"
  /** Whether to spawn in --bare mode. Default: true (test determinism). */
  bare?: boolean
  /** Pass-through model. Default: claude-sonnet-4-6. */
  model?: string
  /** CWD for the App. Default "/tmp/silvercode-test". */
  cwd?: string
  /**
   * When true (default), the harness emits every event in `script`
   * synchronously before returning. Set to false for tests that assert
   * partial states mid-stream — then call `emit()` manually.
   */
  autoEmit?: boolean
  /**
   * Provide a pre-created fake session. Defaults to a fresh one. Useful
   * when a test needs to inspect `fake.sent` before the scenario runs.
   */
  fake?: ScriptedFakeSession
}

/** Default side-panel width. Must match App.tsx's `flexBasis={40}`. */
export const SIDE_PANEL_WIDTH = 40

/** Compute the expected left-region width given cols and side-panel state. */
export function leftWidthFor(cols: number, showSidePanel = true): number {
  return showSidePanel ? cols - SIDE_PANEL_WIDTH : cols
}

const DEFAULT_COLS = 120
const DEFAULT_ROWS = 30

/**
 * Wire up the real <App/> with a ScriptedFakeSession and render it.
 *
 * This is async because the App spawns its initial session via
 * `void spawnSession().catch(...)` — a microtask. We need to flush those
 * microtasks + re-render before the frame stabilizes. Tests should
 * `await renderScenario(...)`.
 */
export async function renderScenario(opts: RenderScenarioOptions): Promise<RenderedScenario> {
  const cols = opts.cols ?? DEFAULT_COLS
  const rows = opts.rows ?? DEFAULT_ROWS
  const cwd = opts.cwd ?? "/tmp/silvercode-test"
  const layout = opts.layout ?? "single"
  const bare = opts.bare ?? true
  const model = opts.model ?? "claude-sonnet-4-6"

  // Silvery's <Screen> component reads process.stdout.columns/rows directly
  // (it calls `getTermDims()` on mount). In test env that returns the host
  // terminal's size, not the `cols`/`rows` we pass to createRenderer.
  // Stub the process values for the duration of the render so <Screen>'s
  // initial width/height match our virtual terminal. We restore on teardown.
  //
  // This is a well-known gap documented in silvery's
  // list-view-flex-sibling.test.tsx — same class of bug.
  const prevCols = process.stdout.columns
  const prevRows = process.stdout.rows
  Object.defineProperty(process.stdout, "columns", { configurable: true, get: () => cols })
  Object.defineProperty(process.stdout, "rows", { configurable: true, get: () => rows })

  const fake = opts.fake ?? createFakeSession()
  const renderer = createRenderer({ cols, rows })
  const app = renderer(
    <App cwd={cwd} bare={bare} layout={layout} track="claude" model={model} spawnFactory={() => fake} />,
  )

  // Let the controller's initial `void spawnSession()` microtask resolve,
  // then trigger React to re-render with the new session in the list.
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
  renderer(<App cwd={cwd} bare={bare} layout={layout} track="claude" model={model} spawnFactory={() => fake} />)

  if (opts.autoEmit !== false) {
    for (const event of opts.script) fake.emit(event)
    // Multiple flushes cover: store.apply → signal propagation → React
    // useStoreSignal re-render → reconciler commit.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve()
    }
    // Re-render explicitly — the reconciler has flushed but createRenderer
    // doesn't auto-sample the buffer; a second renderer() call with the
    // same element reuses the instance but triggers a fresh render pass.
    renderer(<App cwd={cwd} bare={bare} layout={layout} track="claude" model={model} spawnFactory={() => fake} />)
    for (let i = 0; i < 5; i++) {
      await Promise.resolve()
    }
  }

  // Restore process.stdout dims. The renderer captured the frame already;
  // subsequent tests get their own stub.
  Object.defineProperty(process.stdout, "columns", { configurable: true, value: prevCols })
  Object.defineProperty(process.stdout, "rows", { configurable: true, value: prevRows })

  return {
    get text() {
      return app.text
    },
    get lines() {
      return app.lines
    },
    cols,
    rows,
    app,
    fake,
    emit(event: AgentEvent): void {
      fake.emit(event)
    },
    resample(): { text: string; lines: readonly string[] } {
      return { text: app.text, lines: app.lines }
    },
  }
}
