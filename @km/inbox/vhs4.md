---
id: "@km/inbox/vhs4"
aliases:
  - km-vhs4
  - "@km/_orphan/vhs4"
created_at: 2026-01-24T22:27:48Z
closed_at: 2026-01-24T22:53:38Z
assignee: claude-1769322689
---

# [x] Screen goes blank after navigating in km view @km/_orphan #bug #P1 @claude-1769322689

FIXED in commit 3ae0bf0 (Jan 21, 2026)

Root causes:
1. inkx's React reconciler used async updateContainer which doesn't commit work in environments where the event loop isn't pumped (Bun)
2. Board component's isReady state defaulted to false and relied on useEffect to set it to true, but passive effects weren't flushing

Fixes:
- Updated inkx to use updateContainerSync + flushSyncWork
- Set isReady=true initially when valid dimensions are provided
- Removed DeferredBoardLoader component (no longer needed)
- Added simple 'Loading...' indicator during synchronous state loading

Additionally, the render loop bug (@km/_orphan/jfr6) was also fixed, where the spinner animation was running continuously even when not displayed. This is now only activated when isLoading=true.

User should verify the fix by testing km view. If the blank screen still occurs, please create a new bead with reproduction steps.