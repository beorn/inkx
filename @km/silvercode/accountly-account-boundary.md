---
id: "@km/silvercode/accountly-account-boundary"
aliases:
  - accountly-silvercode-account-boundary
  - "@km/config/accountly-silvercode-account-boundary"
  - km-config.accountly-silvercode-account-boundary
  - km-config-accountly-silvercode-account-boundary
created_at: 2026-04-30T10:46:38.929Z
type: task
priority: P1
---

# Review accountly/silvercode account boundary

Review the split between accountly and silvercode account handling. Today silvercode discovers Claude profile dirs, calls accountly quota APIs, owns disk cache shape, and renders account summaries. Decide whether profile discovery, quota cache TTL/files, AccountSummary shaping, and profile filtering should live in accountly, silvercode, or a small shared adapter library. Acceptance: documented recommendation with ownership boundaries; migration plan if shared lib is preferred; tests covering cache persistence and non-credential profile filtering.

