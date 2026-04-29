---
id: "@km/tools/daily-summary"
aliases:
  - km-tools.daily-summary
  - km-tools-daily-summary
created_at: 2026-02-06T23:30:29Z
closed_at: 2026-02-06T23:35:52Z
assignee: claude:0ebbe1f2
---

# [x] Daily session summary replacing per-session remember @km/tools #feature #P2 @claude:0ebbe1f2

Replace per-session LLM remember with a single daily summary across all sessions and content types. Triggered lazily on recall when unprocessed days are detected (up to last 10 days). Each daily summary includes: lessons learned, decisions, bugs found, architectural patterns — with session refs for source traceability. Output shown to user for review. May suggest beads for follow-up work.