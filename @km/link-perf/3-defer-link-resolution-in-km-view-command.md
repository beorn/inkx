---
id: "@km/link-perf/3-defer-link-resolution-in-km-view-command"
aliases:
  - km-link-perf.3
  - km-link-perf-3
  - "@km/link-perf/3"
created_at: 2026-01-23T14:49:29Z
closed_at: 2026-01-23T14:59:51Z
---

# [x] Defer link resolution in km view command @km/link-perf #task #P4

Update view.ts to:
1. Pass skipLinkResolution: true to loadVault
2. Start board rendering immediately
3. Call resolveLinksAsync() in background via setImmediate
4. Emit tuiEvents refresh when done

Files: apps/@km/_orphan/cli/src/commands/view.ts, apps/@km/tui/src/tui.ts