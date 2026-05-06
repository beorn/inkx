---
mentions:
  - km
id: "@km/inbox/jusk"
aliases:
  - km-jusk
  - "@km/_orphan/jusk"
created_at: 2026-01-21T23:25:34Z
closed_at: 2026-01-22T13:43:47Z
---

# [x] Watcher reconciliation erases all issues after completing initial scan @km/_orphan #bug #P1

When viewing @issue.md, all issues are visible during the watcher's initial scan. After the watcher completes reconciliation and shows 'watching N files', the issues disappear/are erased.

This suggests the reconciliation process is incorrectly detecting changes and re-parsing/deleting nodes.

Steps to reproduce:

1. Run km view @issue.md
2. Observe issues are visible during 'watching: syncing' state
3. After watcher finishes and shows 'watching N files', issues disappear

Expected: Issues remain visible after watcher finishes
Actual: Issues are erased/cleared

---

Investigation notes (2026-01-21):

- Could NOT reproduce with ttyd+Playwright testing
- Screenshot shows 49 Open issues visible with 'watching 106 files'
- No reconciliation events observed in debug logs
- Watcher goes directly to 'idle' without sync events
- Needs user to provide specific reproduction steps or observe when bug occurs

