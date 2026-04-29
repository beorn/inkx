---
id: "@km/tui/single-col-missing-top-borders"
aliases:
  - km-tui.single-col-missing-top-borders
  - km-tui-single-col-missing-top-borders
created_by: claude:019d032d
created_at: 2026-04-22T19:09:26Z
closed_at: 2026-04-22T20:11:13Z
close_reason: folded into km-silvery.layout-churn-leaks-pixels (same root cause
  class — incremental-render pixel leak on layout churn)
---

# [x] Single-column card rendering: cards 2+ missing top border (╭─╮) — show only │ ... │ and ╰─╯ @km/tui #bug #P1 @claude:019d032d

blocks:: [[@km/tui]]

Repro (120x40): mkdir -p /tmp/v/inbox /tmp/v/.km; for i in 1 2 3; do echo '# Task '$i > /tmp/v/inbox/t$i.md; done; touch /tmp/v/.km/changes.jsonl /tmp/v/.km/config.toml; bun km view /tmp/v. Observed: inbox column shows Task 1 with full border (╭──╮ / │ │ / ╰──╯). Task 2 and Task 3 are rendered as: │ Task N──────────│ / ╰──────────╯ — the top border ╭──╮ is MISSING, and dashes bleed into the content row's right edge. This is a single-column vault; tested on ASCII-only titles at 120-col width. Does NOT reproduce with multi-column vaults (3 columns done/inbox/next all rendered perfect cards in an adjacent test session). Likely a flexily/silvery incremental-render or card layout bug when a column is full-width and contains 2+ cards. No DEBUG output needed to trigger. Screenshot: /tmp/explore-screenshots/04-single-col-missing-top-borders.png. Captured during /explore session @km/session/0422-explore.