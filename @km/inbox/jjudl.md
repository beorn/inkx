---
mentions:
  - km
id: "@km/inbox/jjudl"
aliases:
  - km-jjudl
  - "@km/_orphan/jjudl"
created_by: claude:4c413aae
created_at: 2026-02-21T23:51:47Z
closed_at: 2026-02-22T01:14:01Z
owner: bjorn@stabell.org
---

# [x] kmast v2: Trait-based node model migration @km/_orphan #feature #P1

Migrate from oi/li/link types to trait-based model: item boolean, embed block type, universal name field. Steps: 1) types+constraints (@km/_orphan/core), 2) parser (@km/markdown), 3) DB schema (@km/storage), 4) consumers (TUI/CLI/tree)

