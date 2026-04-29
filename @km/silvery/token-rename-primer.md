---
id: "@km/silvery/token-rename-primer"
aliases:
  - km-silvery.token-rename-primer
  - km-silvery-token-rename-primer
created_by: Bjørn Stabell
created_at: 2026-04-18T17:45:08Z
closed_at: 2026-04-18T18:26:48Z
close_reason: "Phase 1 shipped in v0.18.0: PRIMER_ALIASES table in
  vendor/silvery/packages/ansi/src/style/style.ts maps Primer-style names
  (fg-muted, bg-surface, border-focus, etc.) to legacy Theme keys. Resolver
  tries direct → alias fallback. 13 alias tests + backward-compat test green.
  Phase 2 (rename Theme fields themselves) deferred to next major."
---

# [x] Primer-style token names (fg-muted, bg-muted, fg-disabled, border-focus, …) @km/silvery #task #P3

blocks:: [[@km/silvery/theme-system-v2]]

Ink-style compound token names in @silvery/ansi Theme interface rename to Primer-style per the design spec Path G. Mechanical rename, ~200 refs across silvery + km. Keep Ink-compat aliases on Theme for one release cycle.\n\nRenames:\n- muted → fg-muted\n- mutedbg → bg-muted\n- disabledfg → fg-disabled\n- focusborder → border-focus\n- inputborder → border-input\n- surfacebg → bg-surface\n- popoverbg → bg-popover\n- inversebg → bg-inverse\n- selectionbg → bg-selected\n- cursorbg → bg-cursor\n\nKeep as-is (already Primer-aligned): primary, accent, fg, bg, error, warning, success, info, border, link, cursor, selection.\n\nFull spec: hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p1