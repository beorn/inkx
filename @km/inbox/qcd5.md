---
mentions:
  - km
id: "@km/inbox/qcd5"
aliases:
  - km-qcd5
  - "@km/_orphan/qcd5"
created_at: 2026-01-21T15:39:25Z
closed_at: 2026-01-21T15:46:10Z
---

# [x] Add config option to disable file watcher/syncer @km/_orphan #feature #P2

Chokidar file watcher blocks event loop for 25+ seconds on large vaults (21k files), making keyboard unresponsive. Add a config option (via cosmicconfig) to disable auto-watch, with CLI override support. Options: 1) km.config.js: watch: false, 2) CLI: --no-watch or KM_NO_WATCH=1 env var

