---
mentions:
  - km
id: "@km/inbox/1tho"
aliases:
  - km-1tho
  - "@km/_orphan/1tho"
created_at: 2026-01-22T13:52:40Z
closed_at: 2026-01-23T11:28:14Z
---

# [x] Fix: paragraph text appearing as column in board view @km/_orphan #bug #P2

When viewing @issue.md, the paragraph text 'All issues tracked with the @issue tag.' appears as a column header after sync.

Expected: Text under file heading should be filtered out (type=paragraph)
Actual: Text appears as a column

Location: buildBoardState in state.ts filters nonColumnTypes but text still shows.

Investigation needed:

- What type does the parser assign to this text?
- Is the filter working correctly?
- Does this only happen after sync?

