---
id: "@km/_orphan/f9oz5"
aliases:
  - km-f9oz5
created_by: claude:b92140a2
created_at: 2026-03-17T08:17:31Z
closed_at: 2026-03-17T15:04:33Z
close_reason: "All 8 findings fixed: 4 P0 + 4 P1. 868 lines changed across 14 files."
owner: bjorn@stabell.org
assignee: claude:b92140a2
---

# [x] Pro Review Round 7: 2026-03-17 — index file system (feature + tests + strategy) @km/_orphan #epic #P2 @claude:b92140a2

GPT 5.4 Pro deep research review of the folder index file system (17 files, 8.5K LOC). Cost: $2.85.

## Results
- **4 P0** (correctness bugs): TUI/writer slot mismatch, body content loss, folder rename breaks same-name, inline mentions as slots
- **4 P1** (safety/quality): lifecycle refresh inconsistent, post-batch incomplete, FS abstraction bypass, config not validated
- **5 P2** (test strategy): race tests sequential, dot-md not E2E tested, missing negative tests, command integration untested, DB lifecycle under-tested
- **2 P3** (style): ReconcileContext could be broader, shared slot helper recommended

## Key Architectural Insight
Root cause of biggest bug: slot semantics duplicated across 3 layers (@km/tree, @km/storage, @km/tui). Reviewer recommends shared extractIndexLayout() helper.

## Beads Created
P0: @km/_orphan/jy8nl, @km/_orphan/g8iuk, @km/_orphan/5mpn0, @km/_orphan/0naz3
P1: @km/_orphan/nek0a, @km/_orphan/23n31, @km/_orphan/laftk, @km/_orphan/c7ac0
P4: @km/_orphan/0jw8d (chaos tests, from earlier)

## Raw Review
/tmp/llm-b92140a2-gpt-54-pro-code-y9ye.txt