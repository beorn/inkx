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
import { ScopeProvider } from "@silvery/ag-react"
import { createScope } from "@silvery/scope"
import { App } from "../App.tsx"
import { createFakeSession, type ScriptedFakeSession } from "./fake-session.ts"

/**
 * Drain pending microtasks so async work queued during render (the
 * controller's `void spawnSession()`, store subscribers' setState, signal
 * effects) commits before assertions run. Production renders settle the
 * same way via the host event loop; tests need to flush explicitly.
 *
 * The cap (one task + ~5 microtasks) is empirically the floor that makes
 * controller spawn + 2 await chain + React commit observable. Higher
 * counts hide real bugs behind extra slack — keep this tight.
 */
async function settle(): Promise<void> {
  // One task lets queued setTimeout(0) effects run; the trailing
  // microtask drain catches Promise-resolution cascades.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
  for (let i = 0; i < 5; i++) await Promise.resolve()
}
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
  /** Pass-through agent id (BUILTIN_AGENTS key). Default: undefined.
   *  When set, the Welcome screen's H1 reads "Silver Code for {label}";
   *  unset falls back to bare "Silver Code". Bead:
   *  km-silvercode.welcome-claude-hardcoded. */
  agent?: string
  /** Pass-through resume id for resume-loading UI tests. */
  resume?: string
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
  /** Override max layout-pass iterations per render. Default: MAX_CONVERGENCE_PASSES (2). */
  maxLayoutPasses?: number
}

/** Returned by `renderScenario` so tests can clean up if they hold on. */
export type RenderedScenarioWithDispose = RenderedScenario & {
  /** Restore module overrides + remove the per-scenario temp HOME. */
  dispose(): void
}

/** Default side-panel width. Must match App.tsx's `SIDE_PANEL_WIDTH`. */
export const SIDE_PANEL_WIDTH = 32

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
  // Default cap = 5 mirrors the pre-max-layout-passes-knob classic-loop
  // default. Tests that need production-matching cap=2 can override via
  // `opts.maxLayoutPasses`. Lowering the default broke timing-dependent
  // controller event assertions in chat-stability + welcome-features
  // (the controller's microtask-based scid mapping races a tighter
  // render loop). Bead: @km/silvercode/render-harness-default-cap.
  // autoRender: true is the production-equivalent setting — silvery's
  // run()/createApp wire this for any App that drives state through async
  // signals (controllers, store subscribers, scope-bound side-effects).
  // Without it, createRenderer only paints on explicit triggers and async
  // setState from `store.events.subscribe → setState(messages)` is invisible
  // to the buffer until the next manual rerender.
  const renderer = createRenderer({
    cols,
    rows,
    maxLayoutPasses: opts.maxLayoutPasses ?? 5,
    autoRender: true,
  })
  // In live mode, omit spawnFactory so the App uses its default
  // spawnClaude / spawnSdk / spawnCodex path. The script (if any) is
  // ignored — the real subprocess produces the events.
  const agent = opts.agent
  const elementProps = live
    ? { cwd, bare, layout, model, agent, resume: opts.resume }
    : { cwd, bare, layout, model, agent, resume: opts.resume, spawnFactory: () => fake }
  // ScopeProvider wraps App so the lifecycle-scope hooks (useScopeEffect /
  // useScope, shipped with vendor/silvery 7d9ee808) have a notification scope
  // to register against. createApp/run() do this for production paths;
  // createRenderer doesn't, so the harness threads it explicitly. Without
  // this, every test that mounts the real App throws "useScope() called
  // without a <ScopeProvider> ancestor".
  const scope = createScope("test-render-harness")
  const tree = (
    <ScopeProvider scope={scope} appScope={scope}>
      <App {...elementProps} />
    </ScopeProvider>
  )
  const app = renderer(tree)

  // Settle the controller's initial `void spawnSession()` so the SessionHandle
  // is in the controller's list before the test asserts. Production renders
  // wait on the same microtask cascade naturally via the event loop; tests
  // need an explicit settle.
  await settle()

  if (opts.autoEmit !== false && !live) {
    for (const event of opts.script) fake.emit(event)
    await settle()
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
      app.rerender(tree)
    },
    resample(): { text: string; lines: readonly string[] } {
      app.rerender(tree)
      return { text: app.text, lines: app.lines }
    },
    dispose(): void {
      app.unmount()
      fakes.dispose()
    },
  }
}
