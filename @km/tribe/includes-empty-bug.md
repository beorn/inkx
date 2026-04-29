---
id: "@km/tribe/includes-empty-bug"
aliases:
  - km-tribe.includes-empty-bug
  - km-tribe-includes-empty-bug
created_by: claude:19080504
created_at: 2026-03-26T17:11:32Z
closed_at: 2026-03-26T17:25:40Z
close_reason: All fixed and pushed. From GPT 5.4 Pro review triage.
owner: bjorn@stabell.org
---

# [x] Beads plugin: includes("") always true when claudeSessionId is null @km/tribe #bug #P1

ctx.claudeSessionId ?? "" makes includes("") always true. Any session without CLAUDE_SESSION_ID thinks every claimed bead is its own. Fix: check truthiness before includes.