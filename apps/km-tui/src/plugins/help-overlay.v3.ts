/**
 * HelpOverlay v3 — `pipe()` + `with*()` + `createSlice` shape.
 *
 * Replaces both:
 *   v1: `with-help-overlay.ts`  (213 LOC, zustand + bridge + hook)
 *   v2: `help-overlay.v2.ts`    ( 33 LOC, definePlugin factory)
 *
 * v3 pattern (validated by aichat composition prototype, 2026-04-21):
 *   - pure reducer via createSlice (typed dispatch, no name string needed)
 *   - with*() shape for the capability: withHelpOverlay(app) → app & { help }
 *   - integrates into the existing silvery pipe() + with-input-chain
 *   - NO factory, NO name namespace, NO per-plugin zustand store
 *
 * Feature-flagged via KM_TEA_HELP_V3=1 so parity tests exercise all three
 * paths (v1 legacy, v2 definePlugin, v3 pipe/with). v1 and v2 stay in
 * place until v3 cutover lands in production (km-tui.tea-help-overlay-v3).
 *
 * See:
 *   hub/silvery/help-overlay.v3.ts          (original spike)
 *   hub/silvery/pipe-with-composition-prototype.md (design rationale)
 */
import { createSlice } from "@silvery/create"

// =============================================================================
// State + reducer (pure — testable without React)
// =============================================================================

export interface HelpState {
  visible: boolean
  scrollOffset: number
}

const init = (): HelpState => ({ visible: false, scrollOffset: 0 })

/**
 * Pure reducer. Each handler returns the next state (or the same one, to
 * signal no-op — avoids pointless rerenders).
 */
export const helpSlice = createSlice(init, {
  show: (s: HelpState): HelpState => (s.visible ? s : { visible: true, scrollOffset: 0 }),
  hide: (s: HelpState): HelpState => (s.visible ? { visible: false, scrollOffset: 0 } : s),
  toggle: (s: HelpState): HelpState =>
    s.visible ? { visible: false, scrollOffset: 0 } : { visible: true, scrollOffset: 0 },
  scrollUp: (s: HelpState): HelpState =>
    s.visible ? { ...s, scrollOffset: Math.max(0, s.scrollOffset - 1) } : s,
  scrollDown: (s: HelpState): HelpState => (s.visible ? { ...s, scrollOffset: s.scrollOffset + 1 } : s),
})

export const helpInit = init

// =============================================================================
// Feature flag
// =============================================================================

export const isTeaHelpV3Enabled = (): boolean => process.env.KM_TEA_HELP_V3 === "1"
