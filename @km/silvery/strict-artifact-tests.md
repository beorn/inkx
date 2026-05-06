---
mentions:
  - km
id: "@km/silvery/strict-artifact-tests"
aliases:
  - km-silvery.strict-artifact-tests
  - km-silvery-strict-artifact-tests
created_by: claude:c9beade3
created_at: 2026-03-15T16:38:43Z
closed_at: 2026-03-15T17:39:23Z
close_reason: "Implemented: 20 artifact tests, loggily structured logging,
  renderNodeToBuffer decomposed into 4 sub-functions"
owner: bjorn@stabell.org
---

# [x] captureStrictFailureArtifacts: add unit tests @km/silvery #task #P3

captureStrictFailureArtifacts has 0 unit tests. Add tests verifying artifacts are captured on STRICT failure (prev/next buffer snapshots, ANSI sequences, backend screenshots, terminal size, test name/fuzz seed).

