---
id: "@km/_orphan/ila18"
aliases:
  - km-ila18
created_by: claude:efb76293
created_at: 2026-03-17T08:12:37Z
closed_at: 2026-03-17T08:27:11Z
close_reason: "Fixed: findInheritedFg/Bg read theme.fg/bg directly from Theme
  object on ancestor Box. Stateless — no context stack dependency. STRICT
  passes, TTY verified."
owner: bjorn@stabell.org
assignee: claude:efb76293
---

# [x] Pipeline: auto-inherit $fg/$bg in Box theme={} subtrees @km/_orphan #task #P1 @claude:efb76293

When a Box has theme={} prop, text nodes inside should auto-inherit the subtree theme's $fg and $bg without needing explicit color="$fg" backgroundColor="$bg" on the Box.

## Problem
Currently, Box theme={} only sets the token resolution context (pushContextTheme/popContextTheme). Text nodes without explicit color still use the terminal's default fg, which is wrong when the subtree theme differs from the terminal (e.g., light theme panel in dark terminal).

## Failed approaches
1. findInheritedFg returning parseColor("$fg") when hasThemeOverride — caused STRICT mismatches at (2,4) on render #2. The incremental buffer had null fg/bg but fresh render had fg=15 bg=8. Root cause: the clone preserves null cells from the first render, but the fresh comparison resolves $fg against the active theme.
2. findInheritedBg with theme fallback — same STRICT mismatch pattern.
3. ThemeProvider-as-Box — caused flicker from setActiveTheme conflict with pushContextTheme.

## Requirements
- Box theme={} auto-inherits $fg for all descendant text (no manual color prop needed)
- Box theme={} auto-inherits $bg for clearing/text bg inheritance
- Must pass SILVERY_STRICT=1 (incremental == fresh render)
- Must not flicker (no module-level theme state conflicts)
- Must not break existing tests (5900+ vendor tests)
- Verify in real TTY with theme demo (bun demo theme)