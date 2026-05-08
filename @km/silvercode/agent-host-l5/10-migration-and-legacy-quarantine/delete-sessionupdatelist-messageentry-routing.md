---
aliases:
  - km-silvercode.agent-host-l5.10-migration-and-legacy-quarantine.delete-sessionupdatelist-messageentry-routing
  - km-silvercode-agent-host-l5-10-migration-and-legacy-quarantine-delete-sessionupdatelist-messageentry-routing
created_at: 2026-05-08T08:00:00.000Z
---

# [/] Delete SessionUpdateList and MessageEntry routing #task #P0 @agent/3

blocks:: [[@km/silvercode/agent-host-l5/10-migration-and-legacy-quarantine]]

After phase 04 cuts ChatPane over to ChatTree/ChatTrack, delete the legacy transcript routing path and renderer-owned inference.

## Complete Criteria

- `rg -n "SessionUpdateList|MessageEntry|ContentBlock" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs` returns zero live-path hits or only explicitly quarantined raw inspector fixtures.
- ChatPane renders from ChatTree/ChatTrack in tests and production.
