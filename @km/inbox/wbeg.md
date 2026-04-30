---
id: "@km/inbox/wbeg"
aliases:
  - km-wbeg
  - "@km/_orphan/wbeg"
created_at: 2026-01-21T23:11:54Z
closed_at: 2026-01-21T23:19:15Z
---

# [x] Bottom bar truncated - verify and fix layout @km/_orphan #bug #P2

Bottom bar text was truncated (showed 'C...' instead of full path). Changed from 3-box flex layout to single Text element. Needs visual verification via ttyd+Playwright to confirm fix works.