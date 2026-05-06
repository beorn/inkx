---
mentions:
  - km
id: "@km/inbox/1ihv"
aliases:
  - km-1ihv
  - "@km/_orphan/1ihv"
created_at: 2026-01-21T22:45:55Z
closed_at: 2026-01-22T00:16:23Z
---

# [x] No tests for config.ts (7 exported functions) @km/_orphan #task #P1

packages/@km/storage/src/config.ts exports 7 public functions with 0 test coverage:

- loadConfig()
- getConfigPath()
- clearConfigCache()
- getBeadsConfig()
- getTuiConfig()
- getOriginalBeadsConfig()
- getOriginalBeadsConfigPath()

Config affects all TUI behavior. Should have tests for:

- Loading valid config files
- Default values when no config
- Cache clearing behavior
- Config search path resolution

