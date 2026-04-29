---
id: "@km/silvery/test-reference-renderer"
aliases:
  - km-silvery.test-reference-renderer
  - km-silvery-test-reference-renderer
created_by: claude:c9beade3
created_at: 2026-03-13T04:37:26Z
closed_at: 2026-03-13T05:22:37Z
close_reason: "Deferred: Independent simple renderer as second oracle for STRICT
  checks. Would need a complete from-scratch renderer (~1000 lines). STRICT
  already compares incremental vs fresh — the fresh renderer IS the reference."
owner: bjorn@stabell.org
---

# [x] Testing gap: independent simple reference renderer as second oracle @km/silvery #task #P3

Current oracle is fresh render using same renderer without skipping. If both share a bug, STRICT passes. Build deliberately simple reference renderer: no skipping, no buffer clone reuse, no excess-clearing optimizations, minimal shared helpers. Compare final buffers in fuzz/CI. Found by GPT 5.4 pro.