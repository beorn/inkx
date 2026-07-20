import type { CursorState } from "@silvery/ag-react/hooks/useCursor"

/** Options shared by terminal and adapter-aware render pipeline callers. */
export interface ExecuteRenderOptions {
  /** Render mode. Default: `fullscreen`. */
  mode?: "fullscreen" | "inline"
  /** Skip notifying layout subscribers during static renders. */
  skipLayoutNotifications?: boolean
  /** Skip scroll-state mutation during fresh-render comparisons. */
  skipScrollStateUpdates?: boolean
  /** Lines written outside the pipeline between inline renders. */
  scrollbackOffset?: number
  /** Terminal height used to clamp inline cursor movement. */
  termRows?: number
  /** Real terminal cursor position for inline output. */
  cursorPos?: CursorState | null
}
