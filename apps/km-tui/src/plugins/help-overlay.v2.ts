/**
 * HelpOverlay v2 — the entire help-overlay plugin in one file.
 *
 * Built against the `definePlugin({...})` spike from
 * `km-silvery.definePlugin`. Replaces:
 *
 *  - `with-help-overlay.ts`   (213 LOC)  — reducer + store + singleton + flag
 *  - `use-help-overlay.ts`    ( 23 LOC)  — useSyncExternalStore bridge
 *  - `HelpOverlayBridge.tsx`  ( 60 LOC)  — React adapter
 *
 * Total v1: 296 LOC across 3 files.
 * Total v2: this file (see `wc -l` for the ground truth).
 *
 * Feature-flagged via KM_TEA_HELP_V2=1 so the parity tests can exercise
 * both paths. The v1 plugin stays in place until the cutover lands.
 */
import { definePlugin } from "@silvery/create"

/** One op per user-visible intent. Types + namespacing inferred. */
export const helpOverlay = definePlugin({
  name: "help",
  state: { visible: false, scrollOffset: 0 },
  ops: {
    show: (s) => (s.visible ? s : { visible: true, scrollOffset: 0 }),
    hide: (s) => (s.visible ? { visible: false, scrollOffset: 0 } : s),
    toggle: (s) => (s.visible ? { visible: false, scrollOffset: 0 } : { visible: true, scrollOffset: 0 }),
    scrollUp: (s) => (s.visible ? { ...s, scrollOffset: Math.max(0, s.scrollOffset - 1) } : s),
    scrollDown: (s) => (s.visible ? { ...s, scrollOffset: s.scrollOffset + 1 } : s),
  },
  keys: { "?": "toggle", Escape: "hide", k: "scrollUp", j: "scrollDown" },
})

export const isTeaHelpV2Enabled = (): boolean => process.env.KM_TEA_HELP_V2 === "1"
