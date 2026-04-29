---
id: "@km/silvercode/timestamps"
aliases:
  - km-silvercode.timestamps
  - km-silvercode-timestamps
created_by: claude:2405c72e
created_at: 2026-04-28T19:36:37Z
---

# [ ] Relative timestamps for turn boundaries — '(2m ago)' next to user/assistant heads @km/silvercode #feature #P2

blocks:: [[@km/silvercode]]

Long sessions lose temporal context. Add relative-time chips at turn boundaries so the user can scan the conversation in time. opencode shows none in the screenshots, but the user listed this as item #12 — desired regardless.

Format: '(now)', '(2m ago)', '(1h ago)', '(3d ago)'. Right-aligned at the end of the turn-head row (USER / ASSISTANT label line) in dim color.

Files: apps/silvercode/src/components/SessionUpdateList.tsx, ExchangeItem.tsx (or wherever turn heads render).

Acceptance:
- Turn head rows show relative time, dim, right-aligned
- Updates every 60s automatically (1-line useEffect with interval)
- termless test: turn from 5 minutes ago shows '(5m ago)'