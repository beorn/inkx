/**
 * Width-matrix runner for silvercode L4 tests.
 *
 * Renders the same scenario across a curated set of terminal widths so a
 * single test exercises every responsive breakpoint instead of pinning a
 * lone "default desktop" width. Catches:
 *
 * - Overflow that only appears at narrow widths (the long-tool-result
 *   class of bug — see `tests/visual/scenarios.test.tsx` and bead
 *   `km-silvercode.overflow-at-root`).
 * - Side-panel collapse / restore across the 88↔120 internal breakpoint
 *   feedback loop documented in `tests/welcome-stability.test.tsx`
 *   line 171 and `tests/chat-stability.test.tsx` line 266.
 * - Layout regressions that only manifest above a certain width
 *   (e.g. content reflow inside ChatBlockList at xl).
 *
 * Pairs with `ui-driver.ts` — each cell yields a `UiDriver` so the body
 * can drive scroll / advanceTime / settle without re-deriving the
 * harness.
 *
 * Bead: @km/silvercode/test-resize-matrix
 */

import { renderScenario, type RenderScenarioOptions, type RenderedScenarioWithDispose } from "./render-harness.tsx"
import { createUiDriver, type UiDriver } from "./ui-driver.ts"

/**
 * Curated terminal widths covering silvery's responsive breakpoints
 * (xs=30, sm=60, md=90, lg=120, xl=150 per `vendor/silvery/CLAUDE.md`)
 * plus extremes that historically broke silvercode-specific layouts:
 *
 * - 40   — narrow / mobile-ish; side panel forced off, content wraps
 *          aggressively. Catches the overflow-at-root class.
 * - 60   — `sm` boundary. The 88↔120 breakpoint loop has a sibling at
 *          ~64 cols where SidePanel transitions in/out.
 * - 90   — `md`. SidePanel stable + content has minimal slack.
 * - 120  — `lg`. The historical "default desktop" target — most existing
 *          tests pin this width. New tests should not assume it.
 * - 160  — `xl`. Content has plenty of slack; reflow regressions hide
 *          here when narrower widths force everything to one line.
 * - 220  — ultra-wide. The "user runs at 352×117" regime that
 *          `feedback-km-view-test-dimensions.md` flagged for km-tui;
 *          silvercode inherits the same axis.
 *
 * Tests can override via `runWidthMatrix({ widths: [...] }, ...)` when
 * a regression is known to be width-specific (e.g., reproduce a bug at
 * a single boundary first, then cover the whole matrix once green).
 */
export const DEFAULT_WIDTH_MATRIX = [40, 60, 90, 120, 160, 220] as const

export interface WidthMatrixCell {
  /** Terminal width used for this cell. */
  readonly cols: number
  /** Terminal height used for this cell. */
  readonly rows: number
  /** Fully settled scenario at the cell's width. */
  readonly scenario: RenderedScenarioWithDispose
  /** UI driver wrapping the scenario — keystrokes / scroll / advanceTime / settle. */
  readonly driver: UiDriver
}

export interface RunWidthMatrixOptions {
  /** Widths to run. Default: `DEFAULT_WIDTH_MATRIX`. */
  readonly widths?: readonly number[]
  /** Terminal height for every cell. Default: 30 (matches `renderScenario`). */
  readonly rows?: number
}

/**
 * Run `body` once per width in the matrix. Each cell gets its own
 * fully-settled scenario + driver; both are disposed after `body` returns
 * (or throws). Cells run sequentially — the harness stubs
 * `process.stdout.columns/rows` per scenario, so parallel cells would
 * race each other on the same global.
 *
 * Failures include the cell's `cols` in the rethrown error so jest /
 * vitest output points at the offending width directly.
 *
 * @example
 *   await runWidthMatrix(
 *     { script: welcome },
 *     async ({ cols, driver }) => {
 *       expect(driver.text, `welcome at cols=${cols}`).not.toBe("")
 *     },
 *   )
 */
export async function runWidthMatrix(
  baseOpts: Omit<RenderScenarioOptions, "cols" | "rows">,
  body: (cell: WidthMatrixCell) => Promise<void> | void,
  opts: RunWidthMatrixOptions = {},
): Promise<void> {
  const widths = opts.widths ?? DEFAULT_WIDTH_MATRIX
  const rows = opts.rows ?? 30

  for (const cols of widths) {
    const scenario = await renderScenario({ ...baseOpts, cols, rows })
    const driver = createUiDriver(scenario)
    try {
      await body({ cols, rows, scenario, driver })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      const wrapped = new Error(`[width-matrix cols=${cols}] ${reason}`)
      if (err instanceof Error && err.stack) wrapped.stack = err.stack
      throw wrapped
    } finally {
      driver.dispose()
    }
  }
}

/**
 * Common invariants that should hold at every width. Centralized so new
 * width-matrix tests don't reinvent them and so a regression in one
 * invariant fixes every test that uses this helper.
 *
 * Caller passes the cell's `text` and `cols`; the function throws on the
 * first violation.
 */
export interface WidthMatrixInvariants {
  /**
   * Forbid frames that are entirely whitespace. A blank frame at any
   * width is either a harness wiring bug or a render-pipeline collapse;
   * neither should be silenced. Default: `true`.
   */
  readonly noBlankFrame?: boolean
  /**
   * Forbid the literal U+FFFD replacement character. Indicates UTF-8
   * truncation mid-codepoint somewhere in the pipeline (see
   * `@km/tui/separator-utf8-truncation`). Default: `true`.
   */
  readonly noReplacementChar?: boolean
  /**
   * Optional caller-supplied invariant. Return a reason string to fail
   * the cell, or `null` when the frame is fine.
   */
  readonly custom?: (text: string, cols: number) => string | null
}

export function expectWidthMatrixInvariants(
  text: string,
  cols: number,
  opts: WidthMatrixInvariants = {},
): void {
  const { noBlankFrame = true, noReplacementChar = true, custom } = opts

  if (noBlankFrame && text.trim().length === 0) {
    throw new Error(`[width=${cols}] frame is entirely blank — harness wiring bug or render-pipeline collapse`)
  }

  if (noReplacementChar && text.includes("�")) {
    throw new Error(
      `[width=${cols}] frame contains U+FFFD replacement character — UTF-8 truncation mid-codepoint`,
    )
  }

  if (custom) {
    const reason = custom(text, cols)
    if (reason) throw new Error(`[width=${cols}] ${reason}`)
  }
}
