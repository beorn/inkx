---
id: "@km/silvery/loggily-diagnostics"
aliases:
  - km-silvery.loggily-diagnostics
  - km-silvery-loggily-diagnostics
created_by: claude:c9beade3
created_at: 2026-03-15T16:38:46Z
closed_at: 2026-03-15T17:39:23Z
close_reason: "Implemented: 20 artifact tests, loggily structured logging,
  renderNodeToBuffer decomposed into 4 sub-functions"
owner: bjorn@stabell.org
---

# [x] Migrate pipeline diagnostics to loggily @km/silvery #task #P3

Replace globalThis.__silvery_* globals and SILVERY_INSTRUMENT with loggily structured logging. Use namespaced spans (silvery:pipeline, silvery:content:node, silvery:content:scroll, silvery:output). Keep STRICT verification env vars as behavior flags — loggily only handles diagnostic transport.