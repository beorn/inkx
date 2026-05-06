---
mentions:
  - km
  - claude
id: "@km/tribe/checkpoint-resume"
aliases:
  - km-tribe.checkpoint-resume
  - km-tribe-checkpoint-resume
created_by: claude:19080504
created_at: 2026-03-28T14:44:36Z
closed_at: 2026-03-28T14:47:39Z
close_reason: "Fixed: pre-compact hook finds session's tracking bead and injects
  RESUME directive. Checkpoint skill writes RESUME as first line. Post-compact
  Claude sees 'RESUME: bd show <id>' immediately."
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] Sessions don't resume tracked bead after /compact — lose working context @km/tribe #bug #P1 @claude:19080504

After /compact, sessions lose working context. They see all in_progress beads and pick wrong ones (or try to wrap up). Multiple sessions share the same repo — can't use 'most recent checkpoint' globally.

Fix: bd prime (session start hook) should find checkpoint beads claimed by THIS session's CLAUDE_SESSION_ID, created in last few hours, and surface as RESUME directive. The compact summary must also include the active bead ID prominently.

Key: CLAUDE_SESSION_ID persists across compactions within the same session.

