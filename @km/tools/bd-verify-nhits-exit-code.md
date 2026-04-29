---
id: "@km/tools/bd-verify-nhits-exit-code"
aliases:
  - km-tools.bd-verify-nhits-exit-code
  - km-tools-bd-verify-nhits-exit-code
created_by: claude:cc081a9a
created_at: 2026-04-27T20:23:41Z
closed_at: 2026-04-27T20:42:15Z
close_reason: "fe0adca89 — nHits pass condition now ANDs count match with
  exit-code check: grep family (grep, rg, git-grep) accept exit<=1 (1=no-match
  is benign), non-grep heads require strict exit===0. Prevents broken regex
  (exit 2, 0 hits) from spuriously satisfying expected=0. Test 'grep -E \"[\"
  /dev/null -> 0 hits' now correctly fails (exit 2). Verified: 41/41 tests;
  smoke case km-silvery.feedback-trace-loggily still flags 3/4 fails
  (recordPassCause discrepancy preserved); 0 typecheck errors. Branch
  agent-bd-verify-hardening pushed to origin (SHA
  fe0adca89f015567a20d73c23757b253c03e6d40)."
started_at: 2026-04-27T20:32:54Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-tools.bd-verify-nhits-exit-code
    depends_on_id: km-all.bd-verify-primitive
    type: parent-child
    created_at: 2026-04-27T13:23:41Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] bd-verify: nHits pass condition must AND with exitCode === 0 @km/tools #task #P3 @claude:cc081a9a

blocks:: [[@km/all/bd-verify-primitive]]

From dual-pro review (Gemini 3 Pro insight, 2026-04-27): nHits comparison only checks the count, not whether the command succeeded. A failing grep (exit 1 = no match) returns 0 hits, which can spuriously satisfy 'expect 0 hits' even when the command itself errored (e.g. invalid regex). Fix: pass condition must be (count === expected && exitCode === 0). Reference: /tmp/llm-cc081a9a-review-three-pieces-of-mjjw.txt lines 335-345.