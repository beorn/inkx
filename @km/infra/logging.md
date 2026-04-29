---
id: "@km/infra/logging"
aliases:
  - km-infra.logging
  - km-infra-logging
created_at: 2026-02-04T14:41:14Z
closed_at: 2026-02-04T14:58:12Z
---

# [x] Verbosity/log-level integration with zero-overhead pattern @km/infra #chore #P2 @claude:90e14a90

Enhance logging integration:
1. Rename createConditionalLogger → createLogger in @beorn/logger (make zero-overhead pattern the default)
2. Add -q (quiet) flag to CLI
3. Update all imports across codebase (~74 files)
4. Update documentation (logger docs, skills docs, code review checklist)

See plan: ~/.claude/plans/linear-knitting-island.md