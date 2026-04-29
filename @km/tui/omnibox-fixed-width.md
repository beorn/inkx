---
id: "@km/tui/omnibox-fixed-width"
aliases:
  - km-tui.omnibox-fixed-width
  - km-tui-omnibox-fixed-width
created_by: Bjørn Stabell
created_at: 2026-04-15T06:07:02Z
closed_at: 2026-04-16T00:28:18Z
close_reason: "Fixed by commit b02d159e8. Test:
  apps/km-tui/tests/unified-omnibox-integration.test.ts \"dialog width is stable
  across frames as results stream in\". Fix site:
  apps/km-tui/src/views/WorkspaceChrome.tsx (CenterDialog wrapper now pins
  width; omnibox mount uses computeOmniboxDialogWidth) +
  apps/km-tui/src/views/board-layout.ts (shared OMNIBOX_MAX_WIDTH=100,
  OMNIBOX_WIDTH_FRACTION=3/4, computeOmniboxDialogWidth helper). Chosen width:
  Math.min(100, floor(termWidth * 3/4)) — same math as before, but now resolved
  through a single helper called by both the wrapper Box and the inner
  ModalDialog so they can't drift. Verification: test fails (border end: 104 →
  93) when ModalDialog.width prop is removed, passes with it. All 2258 km-tui
  tests pass; bun fix clean."
---

# [x] Omnibox: search box should be fixed width @km/tui #task #P1 @Bjørn Stabell

blocks:: [[@km/tui]]

User feedback: the omnibox search box currently changes width as results stream in or buffer content grows. It should be locked to a fixed width (e.g. 80-100 cols or a fraction of termWidth).

Reproduction: open via : or Cmd-K, type progressively — the outer Box / ModalDialog width shifts.

Fix site: apps/@km/tui/src/views/WorkspaceChrome.tsx around the CenterDialog mount points (both UnifiedOmniboxConnector and the legacy Omnibox mount). Both should pin a stable width so layout never jitters.

Related: @km/tui/omnibox-quality-plateau