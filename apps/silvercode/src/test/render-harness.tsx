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
import { type AccountScenario, installFakes, type InstalledFakes } from "./fake-boundaries.ts"

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
  /**
   * Account scenario for the SidePanel quota bar. Default: a healthy
   * canned scenario. Set `null` to leave accountly unmocked (real keychain,
   * real /api/usage — only meaningful in `SILVERCODE_REAL=1` mode).
   */
  account?: AccountScenario | null
  /**
   * Fake `claude --version` string. Default `"2.1.119"`. Set `null` to
   * use the real spawn (only meaningful in real-mode).
   */
  version?: string | null
  /**
   * Fake git branch. Default `"main"`. Set `null` for real `.git/HEAD` walk.
   */
  branch?: string | null
  /**
   * Per-scenario root for HOME / XDG_CACHE_HOME. Default: a fresh
   * `mkdtempSync` allocated under `tmpdir()` and removed on dispose. Set
   * to `null` to leave HOME alone (live mode).
   */
  fsRoot?: string | null
  /**
   * Live mode. When true, the harness does NOT install a ScriptedFakeSession;
   * the App spawns the real Claude CLI subprocess via its default factory.
   * Used by `*.live.test.tsx` contract tests under SILVERCODE_REAL=1.
   * Implies `account/version/branch/fsRoot` default to `null` so every
   * boundary runs against the production implementation.
   */
  live?: boolean
}

/** Returned by `renderScenario` so tests can clean up if they hold on. */
export type RenderedScenarioWithDispose = RenderedScenario & {
  /** Restore module overrides + remove the per-scenario temp HOME. */
  dispose(): void
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
export async function renderScenario(opts: RenderScenarioOptions): Promise<RenderedScenarioWithDispose> {
  const cols = opts.cols ?? DEFAULT_COLS
  const rows = opts.rows ?? DEFAULT_ROWS
  const cwd = opts.cwd ?? "/tmp/silvercode-test"
  const layout = opts.layout ?? "single"
  const bare = opts.bare ?? true
  const model = opts.model ?? "claude-sonnet-4-6"

  const live = opts.live === true
  // Install third-party-boundary fakes (accountly, git branch, version,
  // fs HOME). Each is bypassed when its option is `null` — that's the
  // hook the live-mode test path uses to exercise real implementations.
  // When `live: true`, every boundary defaults to `null` so the App hits
  // the real keychain / git / claude-version / ~/.cache paths.
  const fakes: InstalledFakes = installFakes({
    account: live ? (opts.account ?? null) : opts.account,
    version: live ? (opts.version ?? null) : opts.version,
    branch: live ? (opts.branch ?? null) : opts.branch,
    fsRoot: live ? (opts.fsRoot ?? null) : opts.fsRoot,
  })

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
  // In live mode, omit spawnFactory so the App uses its default
  // spawnClaude / spawnSdk / spawnCodex path. The script (if any) is
  // ignored — the real subprocess produces the events.
  const elementProps = live
    ? { cwd, bare, layout, track: "claude" as const, model }
    : { cwd, bare, layout, track: "claude" as const, model, spawnFactory: () => fake }
  const app = renderer(<App {...elementProps} />)

  // Let the controller's initial `void spawnSession()` microtask resolve,
  // then trigger React to re-render with the new session in the list.
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
  renderer(<App {...elementProps} />)

  if (opts.autoEmit !== false && !live) {
    for (const event of opts.script) fake.emit(event)
    // Multiple flushes cover: store.apply → signal propagation → React
    // useStoreSignal re-render → reconciler commit.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve()
    }
    // Re-render explicitly — the reconciler has flushed but createRenderer
    // doesn't auto-sample the buffer; a second renderer() call with the
    // same element reuses the instance but triggers a fresh render pass.
    renderer(<App {...elementProps} />)
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
    dispose(): void {
      fakes.dispose()
    },
  }
}
