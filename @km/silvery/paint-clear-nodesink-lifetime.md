---
id: "@km/silvery/paint-clear-nodesink-lifetime"
aliases:
  - km-silvery.paint-clear-nodesink-lifetime
  - km-silvery-paint-clear-nodesink-lifetime
created_by: claude:cc081a9a
created_at: 2026-04-27T20:22:29Z
---

# [ ] Paint-clear Step 2 — fix nodeSink lifetime in render-phase.ts @km/silvery #task #P2

blocks:: [[@km/silvery/paint-clear-l5-final]]

From dual-pro review of paint-clear WIP (Kimi K2.6 winner, judge cost $3.12, 2026-04-27): Smell #1 — nodeSink is created at the top of renderNodeToBuffer but mutated/used in a way that leaks across recursion levels. Move nodeSink creation down to the site where it's actually consumed; ensure each subtree gets its own sink lifetime. Failing to fix this before Step 2 (PlanSink authoritative) bakes the wrong sink-ownership model into the architecture, turning Step 2 from a signature change into a multi-file mechanical slog. Acceptance: nodeSink lifetime reviewed and corrected; STRICT-mode test exercises the changed call site at realistic-scale (50+ nodes per silvery CLAUDE.md mandate). Reference: /tmp/llm-cc081a9a-review-three-pieces-of-mjjw.txt lines 173-201.