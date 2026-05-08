---
mentions:
  - km
id: "@km/silvercode/test-process-harness"
aliases:
  - km-silvercode.test-process-harness
  - km-silvercode-test-process-harness
created_by: claude:0940ca20
created_at: 2026-04-24T21:49:46Z
closed_at: 2026-04-25T06:55:28Z
close_reason: >-
  Process-harness shipped (commit c930b3e9c — note: parallel-agent staging
  collision means the commit message attributes a sibling beads-chore; the file
  additions are this bead's work, 651 lines across 4 files).


  Verification:

  - bun vitest run apps/silvercode/tests/process/cursor-startup.test.tsx
    - "welcome screen mounts" PASSES
    - "hardware cursor lands at the command prompt" FAILS (reproduces P1 bug km-silvercode.cursor-startup-position)
  - The failure is the desired one: harness drives a real PTY-backed silvercode
  subprocess, captures hardware cursor position, asserts (x < 84 AND y >= 24);
  buggy reality is (120, 39).


  Sibling P1 (km-silvercode.cursor-startup-position) remains OPEN — the fix
  isn't in this bead; this bead provides the test infra to verify the fix when
  it lands.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.test-process-harness
    depends_on_id: km-silvercode.test-system
    type: parent-child
    created_at: 2026-04-24T14:49:51Z
    created_by: claude:0940ca20
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: "@km/silvercode/agent-host-l5/09-test-system-and-quality-gates/test-system"
---

# [x] Silvercode test system v2 — process harness for alt-screen / stderr @km/silvercode #feature #P2

blocks:: [[@km/silvercode/agent-host-l5/09-test-system-and-quality-gates/test-system]]

blocks:: [[@km/silvercode/test-system]]

