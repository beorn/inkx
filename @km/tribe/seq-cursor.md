---
id: "@km/tribe/seq-cursor"
aliases:
  - km-tribe.seq-cursor
  - km-tribe-seq-cursor
created_by: claude:19080504
created_at: 2026-03-26T17:11:33Z
closed_at: 2026-03-26T17:25:40Z
close_reason: All fixed and pushed. From GPT 5.4 Pro review triage.
---

# [x] Replace timestamp cursor with monotonic sequence for message delivery @km/tribe #feature #P1

Timestamp-only cursor causes replay on reconnect when messages share the same ms timestamp. Add seq INTEGER column to messages, cursor tracks last_seq instead of last_ts.