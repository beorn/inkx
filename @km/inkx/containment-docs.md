---
id: "@km/inkx/containment-docs"
aliases:
  - km-inkx.containment-docs
  - km-inkx-containment-docs
created_at: 2026-02-06T15:47:09Z
closed_at: 2026-02-11T18:36:36Z
---

# [x] Document infinite loop prevention patterns @km/inkx #feature #P4

Add docs section on avoiding layout feedback loops when using useContentRect(). Like CSS containment for Container Queries, inkx has rules to prevent components that read their size from causing infinite re-layout. Document the dos/don'ts: what patterns are safe, what triggers cycles, how the runtime detects and stops them.