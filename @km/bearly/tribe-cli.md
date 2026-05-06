---
mentions:
  - km
  - claude
id: "@km/bearly/tribe-cli"
aliases:
  - km-bearly.tribe-cli
  - km-bearly-tribe-cli
created_by: claude:19080504
created_at: 2026-03-23T07:01:35Z
closed_at: 2026-03-25T22:36:08Z
close_reason: "Standalone CLI: bun tribe {status,send,log,health,sessions}. 219
  lines, uses bun:sqlite directly."
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] Phase 3: tribe CLI subcommand @km/bearly #feature #P3 @claude:19080504

Add tribe subcommand to bd or standalone: tribe status (show active sessions), tribe send <to> <message>, tribe log (recent messages), tribe health (diagnostics). Enables user to inspect and interact with tribe from terminal without Claude Code.

