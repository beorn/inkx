---
id: "@km/tui/edit-display-sync"
aliases:
  - km-tui.edit-display-sync
  - km-tui-edit-display-sync
created_by: Bjørn Stabell
created_at: 2026-04-02T00:24:31Z
closed_at: 2026-04-02T00:29:05Z
---

# [x] Edit display shows stale content after ctrl-n/p navigation @km/tui #bug #P1

When navigating between nodes with ctrl-n/p during edit, the non-editing display of the previous node sometimes shows stale content (the text before editing, not the saved text). The data IS saved to the repo correctly — the display just doesn't refresh.

Likely cause: reactive node store edit.value is cleared (syncEdit line 308-310) but the non-editing renderer reads from a cached snapshot that doesn't include the repo mutation from save(). The requestRenderFlush added in d068dc6c may help but needs real-app verification.

Two representations: repo.getNode(id).content (truth) vs reactive nodeStore display (cached). After save+navigate, the display path may read the old cached value before the repo mutation propagates.