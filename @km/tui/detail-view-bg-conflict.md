---
id: "@km/tui/detail-view-bg-conflict"
aliases:
  - km-tui.detail-view-bg-conflict
  - km-tui-detail-view-bg-conflict
created_by: Bjørn Stabell
created_at: 2026-04-14T05:28:29Z
closed_at: 2026-04-14T06:43:40Z
close_reason: Removed dead themeFgBg/applyBg/ANSI_BG_COLORS in
  apps/km-tui/src/text/colors.ts — only km source path that could inject
  chalk-style bg ANSI (bgWhiteBright = \u001b[107m) into Text payloads. Added
  detail-bg-conflict.slow.test.ts regression guard. Could not statically repro
  against user vault in headless — guard is forward-going. Commit c0e2dffd8.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-tui.detail-view-bg-conflict
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-13T22:28:30Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Detail view crash: chalk bg=brightWhite conflicts with silvery bufferBg @km/tui #bug #P2 @Bjørn Stabell

blocks:: [[@km/tui]]

Pressing 'D' (detail view) on @agent column in ~vault crashes with: '[silvery] Background conflict at (4,9): chalk bg=brightWhite on silvery bufferBg=rgb(50,50,50). Text: "+Taxes". Raw ANSI: \u001b[4:5m\u001b[2m\u001b[189m\u001b[107m+Taxes...'. The \u001b[107m is SGR bgWhiteBright. Something in km is producing chalk-style ANSI bg that clashes with silvery's buffer bg model. Likely in detail view rendering of project sigils. Need to use ansi.bgOverride() instead of raw chalk bg, OR find why bgWhiteBright is being applied. Repro: bun km view ~/Bear/Vault, navigate to @agent column, press D.