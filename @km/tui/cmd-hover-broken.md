---
id: "@km/tui/cmd-hover-broken"
aliases:
  - km-tui.cmd-hover-broken
  - km-tui-cmd-hover-broken
created_by: claude:ceb7c9cb
created_at: 2026-03-29T02:16:43Z
closed_at: 2026-03-30T07:42:00Z
close_reason: "Fixed: replaced useModifierKeys (requires Kitty REPORT_ALL_KEYS
  which breaks hover) with mouse event metaKey tracking. Cmd state is now
  detected from onMouseEnter/onMouseMove e.metaKey — works with standard mouse
  mode 1003. Cmd+hover shows popover, Cmd+click zooms to target."
---

# [x] Cmd+hover detail popup not working — bead closed prematurely @km/tui #bug #P2

## Problem
ALL hover interactions broken — not just Cmd+hover, but plain card hover border highlight and Link Cmd+hover.

## Investigation findings
- use-card-interaction.ts IS wired into CardColumn.tsx (line 181)
- Handlers spread onto Box elements correctly ({...hoverHandlers})
- The centralized hover system (ReactiveNodeStore) replaced useState(hovered)
- Silvery mouse event processing is UNCHANGED in last 5 days
- Kitty flags changes reverted — back to DISAMBIGUATE only

## Likely root cause
The centralized debounced hover (commit 5b7230c4, 4 days ago) replaced per-card useState with ReactiveNodeStore signals. Either:
1. The debounce (80ms) is swallowing events
2. useReactive() doesn't trigger re-renders correctly
3. nodeStore.setHovered() path has a bug
4. The onMouseEnter Box props aren't reaching silvery's hit-test layer

## Repro
1. bun km view ~/Bear/Vault
2. Move mouse over any card — should see faint border change
3. Hold Cmd + hover over a link — should see underline + pointer cursor
4. Neither works

## Next steps
- Add console.log to handleMouseEnter in use-card-interaction.ts to verify events arrive
- Check if useReactive(signal) triggers renders
- Test with the old useState(hovered) path to confirm it's the reactive system