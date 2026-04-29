---
id: "@km/tui/chord-invalid-bell"
aliases:
  - km-tui.chord-invalid-bell
  - km-tui-chord-invalid-bell
created_by: Bjørn Stabell
created_at: 2026-04-13T23:26:10Z
closed_at: 2026-04-18T18:58:22Z
close_reason: "Fixed in 4a5cba3c8 (failing test) + 6f8793c53 (fix).
  chord-state.ts: unconditional cancel on unmatched second key; replay fallback
  removed; chord-state bell handler in board-app.ts ~558 (chordCancelled→\\x07)
  was already wired. Tests: packages/km-commands 551 pass (+1). TSC baseline
  unchanged."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Invalid chord sequence should bell, not execute partial match @km/tui #bug #P3 @Bjørn Stabell

When pressing a chord like 'g +' where the second key has no binding, it ignores the second key and executes the first key's default ('g' = move to). Should ring the bell instead to indicate invalid chord.