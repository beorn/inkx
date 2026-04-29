---
id: "@km/tui/next-md-sync"
aliases:
  - km-tui.next-md-sync
  - km-tui-next-md-sync
created_by: Bjørn Stabell
created_at: 2026-03-31T18:42:25Z
closed_at: 2026-03-31T20:17:48Z
close_reason: "Fixed: tuiEvents.emit('refresh') was a dead event — nothing
  subscribed. Replaced with repo.touch() which bumps version + notifies React
  subscribers. External edits now trigger re-render. Fix in tui.tsx:132."
owner: bjorn@stabell.org
---

# [x] External edit to @next.md doesn't appear in km view @km/tui #bug #P2

When editing @next.md externally and adding a task under ## Next, the change doesn't appear in km view.

Investigation findings:
- Watcher has 5s debounce (debounceFs: 5000 in sync.ts:86)
- update-handler.ts:108-112 skips if content hash unchanged
- handleUpdate properly re-parses, diffs, and emits changes for .md files
- diffNodes should handle new children under existing sections

Likely causes (ordered):
1. User didn't wait 5s for debounce to fire
2. diffNodes doesn't correctly match new task items under existing mdsection
3. In-flight tracking may suppress the watcher event if km recently wrote to the same file
4. The node_created event for new tasks may not trigger a UI re-render

Next steps: reproduce with DEBUG=km:storage:* DEBUG_LOG=/tmp/sync.log, edit externally, wait 10s, check log.