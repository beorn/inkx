---
id: "@km/silvery/backdrop-fade-toward-bg"
aliases:
  - km-silvery.backdrop-fade-toward-bg
  - km-silvery-backdrop-fade-toward-bg
created_by: Bjørn Stabell
created_at: 2026-04-19T07:06:27Z
closed_at: 2026-04-19T07:19:35Z
close_reason: "Shipped at silvery a83b4439 + km e7530ac74. Two-channel transform
  in backdrop-phase.ts: cell.fg AND cell.bg blend toward pure black (#000000 on
  dark themes) or pure white (#ffffff on light themes), derived from rootBg
  luminance. ag.ts finds rootBg via ThemeProvider's Box theme prop. Null/default
  bg cells stay untouched. 8 tests pass at STRICT=2. No public API change."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.backdrop-fade-toward-bg
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-19T00:06:40Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Backdrop-fade: mix both fg AND bg toward theme $bg (stronger spotlight) @km/silvery #feature #P2

blocks:: [[@km/silvery]]

Current backdrop-phase blends only cell.fg toward cell.bg. Text dims but colored surfaces (borders, badges, panels) stay fully saturated — backdrop still looks structurally colorful, just with unreadable text.

Proposed: also blend cell.bg toward the theme's root $bg. Both fg and bg converge toward the terminal's darkest/lightest neutral (dark scheme → $bg which is near-black; light scheme → $bg which is near-white). Classic 'modal spotlight' effect: the modal is the only full-fidelity region; everything else recedes as a single dimmed surface.

Implementation:
1. backdrop-phase.ts: extend the fade passes so FADE_EXCLUDE_ATTR (outside-modal fade) also transforms cell.bg via blend(cell.bg, rootBg, fadeAmount).
2. Need to know rootBg. Two options: (a) pass the active Theme into applyBackdropFade via options; (b) extract from the tree root's effective bg. Option (a) is simpler.
3. Preserve existing behavior at ansi16 tier (stamps dim) and mono tier (no-op).
4. Tests: tests/features/backdrop-fade.test.tsx already has 5 cell-level assertion tests. Add 2 tests: (i) outside-modal cells with colored bg have bg blended toward $bg, (ii) outside-modal cells with null bg (inherit root) stay unchanged.
5. FADE_ATTR (inside-fade) mode can either get the same treatment or stay fg-only — user preference. Default: both-channel fade for consistency.

Acceptance: visual regression OK; backdrop feels visibly stronger than pure fg-fade; existing 5 tests stay green; new 2 tests pass.