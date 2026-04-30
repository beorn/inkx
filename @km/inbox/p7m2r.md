---
id: "@km/inbox/p7m2r"
aliases:
  - km-p7m2r
  - "@km/_orphan/p7m2r"
created_by: claude:c9beade3
created_at: 2026-03-15T07:30:14Z
closed_at: 2026-03-15T07:48:11Z
close_reason: "Added captureStrictFailureArtifacts() to output-phase.ts. On
  STRICT verification failure (OUTPUT, TERMINAL, ACCUMULATE), auto-captures to
  /tmp/silvery-strict-failure-<timestamp>/: meta.json, error.txt,
  incremental.ansi, fresh.ansi, prev-buffer.txt, next-buffer.txt,
  fresh-prev.ansi. Artifact path included in error message."
owner: bjorn@stabell.org
---

# [x] STRICT failure: auto-capture debug artifacts @km/_orphan #task #P3

On STRICT verification failure, auto-capture prev/next buffer snapshots, ANSI sequence, backend screenshots, terminal size, and test name to /tmp/silvery-strict-failure-<timestamp>/. Log path in error message.