---
id: "@km/tui/cold-startup-rebaseline"
aliases:
  - km-tui.cold-startup-rebaseline
  - km-tui-cold-startup-rebaseline
created_by: claude:8b5b9e1c
created_at: 2026-04-21T07:43:39Z
closed_at: 2026-04-21T07:58:36Z
close_reason: "Measurement complete: 4.0s median interactive (IMPROVED). Report:
  hub/km/cold-startup-rebaseline-2026-04-21.md (SHA 128b6f377). Instrumentation:
  6 run.span() wrappers in tui.tsx (SHA 9a3b5c7f3 — note misattributed commit
  message from concurrent-agent hook). Phase breakdown: repo-load 915ms +
  detect-theme 457ms + run-board ~766ms. No event-loop block fires. Separate
  --no-interactive 17s path still present (add-rule eval bound); tracked via
  parent bead."
---

# [x] Cold-start rebaseline after C2 collapse-parse (30min measurement, not optimization) @km/tui #task #P2 @claude:8b5b9e1c

blocks:: [[@km/tui]]

Dual-pro review 3 (2026-04-21) flagged a missed step: we shipped C2 collapse-parse (540K → 65K nodes, 87.8% reduction) but never re-measured cold startup. The prior 17s block may have been largely dominated by the 555K-node parse; post-C2 it may already be <2s without any perf work.

## Scope: 30min MEASUREMENT ONLY

Do NOT optimize. Do NOT instrument deeply. Just measure.

1. Current cold-start time: bun km view ~/Bear/Vault, stopwatch from invoke to first interactive frame
2. Phase attribution: rough breakdown (loading, parsing, indexing, rendering) via existing instrumentation OR new 5-line timing
3. Compare to pre-C2 expectation (17s)
4. Write findings to hub/km/cold-startup-rebaseline-2026-04-21.md
5. Update @km/tui/cold-startup-block bead with updated numbers

## Outcome paths

- Cold-start <2s: close @km/tui/cold-startup-block as 'resolved by C2'
- Cold-start 2-8s: downgrade to P3, defer perf work
- Cold-start >8s: keep at P2, C2 alone didn't fix it, needs real perf investigation