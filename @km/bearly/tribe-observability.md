---
mentions:
  - km
  - claude
id: "@km/bearly/tribe-observability"
aliases:
  - km-bearly.tribe-observability
  - km-bearly-tribe-observability
created_by: claude:19080504
created_at: 2026-03-23T07:01:43Z
closed_at: 2026-03-25T22:36:08Z
close_reason: "tribe-retro CLI + tribe_retro MCP tool. Metrics: message volume,
  per-member activity, response latency, timeline, coordination health."
owner: bjorn@stabell.org
assignee: claude:19080504
---

# [x] Observability: retro generation + self-improvement loop @km/bearly #feature #P3 @claude:19080504

Implement the retrospective process: gather events, compute metrics (cycle time, claim latency, block duration, external latency), classify failures, generate retro markdown, persist lessons to bd remember + retros table. Include tribe_retro() MCP tool and auto-retro on tribe end.

