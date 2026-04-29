---
id: "@km/tribe/input-validation"
aliases:
  - km-tribe.input-validation
  - km-tribe-input-validation
created_by: claude:19080504
created_at: 2026-03-26T17:11:34Z
closed_at: 2026-03-26T17:25:40Z
close_reason: All fixed and pushed. From GPT 5.4 Pro review triage.
owner: bjorn@stabell.org
---

# [x] Input validation: name regex, message length cap, control char stripping @km/tribe #feature #P2

Names should match ^[a-z0-9][a-z0-9_-]{0,31}$. Messages capped at 2048 chars. Strip control characters. Prevents injection surface.