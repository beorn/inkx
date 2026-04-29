---
id: "@km/silvery/ai-chat-bugs"
aliases:
  - km-silvery.ai-chat-bugs
  - km-silvery-ai-chat-bugs
created_by: claude:e8fd4b92
created_at: 2026-03-10T21:24:19Z
closed_at: 2026-03-11T08:26:10Z
close_reason: "Fixed 3 bugs: (1) inline scrollback promotion - removed padding
  approach, proper cursor tracking prevents 'redrawn from top'; (2) focus
  reporting disabled in inline mode prevents blank screen on window focus; (3)
  app exit fixed - React unmount + shouldExit early return in processEventBatch.
  Ctrl+C/Escape/double-Ctrl+D all exit cleanly now. Commits: cc8251f
  (output-phase), 419439f (exit fix) in silvery."
owner: bjorn@stabell.org
assignee: claude:73d7a332
---

# [x] AI chat showcase: garbled output on Enter, Ctrl+D exit broken @km/silvery #bug #P2 @claude:73d7a332

Terminal AI chat showcase (static-scrollback.tsx / ai-chat.tsx) has multiple issues:

## Bugs
1. **Garbled output after hitting Enter a few times** — rendering breaks after advancing the demo
2. **Ctrl+D twice doesn't exit** — double Ctrl+D within 500ms should exit but doesn't work

## Ctrl+D Analysis
Both useReadline (inside TextInput) and the parent useInput handler subscribe to the same "input" event. All handlers fire (no stop-propagation). useReadline catches Ctrl+D first:
- Empty input: calls `onEOF?.()` (undefined in this case — no-op), returns
- Non-empty input: falls through to readline-ops (probably delete-forward)

The parent handler records timestamp on first Ctrl+D, exits on second within 500ms. Both should fire, but need to verify order and whether readline's handling interferes.

## Garbled Output
May be a rendering/layout issue in inline mode with ScrollbackList. Need to reproduce and diagnose.

## Reproduce
`bun run examples/interactive/ai-chat.tsx` or `bun run examples/interactive/static-scrollback.tsx`
- Hit Enter several times to advance the demo
- Hit Ctrl+D twice quickly to try to exit