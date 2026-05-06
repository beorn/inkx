---
mentions:
  - km
  - claude
id: "@km/tui/progress-checkmarks"
aliases:
  - km-tui.progress-checkmarks
  - km-tui-progress-checkmarks
created_at: 2026-02-05T15:09:34Z
closed_at: 2026-02-05T15:18:48Z
assignee: claude:b53ef7e4
---

# [x] Steps runner: final step not checked off, parent incomplete @km/tui #bug #P2 @claude:b53ef7e4

With clear: false in load-repo, the progress output is now visible and shows:

```
○ Load repo
✔ Load repo 259ms
  ✔ Reading events (122/122) 158ms
  ✔ Applying changes (122/122) 73ms
  ○ Evaluating rules
```

Two issues:

1. 'Evaluating rules' (final sub-step) stays ○ — never gets checked off
2. Parent 'Load repo' shows as ○ on the first line (the ✔ on line 2 is likely a re-render artifact)

The steps runner likely calls stop() before marking the final step complete. The fix is in the inkx-ui progress/steps code — ensure the last step gets its ✔ before stop() runs.

