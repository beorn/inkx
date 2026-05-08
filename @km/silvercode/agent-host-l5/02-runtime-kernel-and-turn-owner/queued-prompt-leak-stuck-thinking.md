---
aliases:
  - km-silvercode.queued-prompt-leak-stuck-thinking
  - km-silvercode-queued-prompt-leak-stuck-thinking
created_at: 2026-05-07T06:10:31.528Z
closed_at: 2026-05-07T06:27:24.442Z
closeReason: "shipped 7b6f71212 — apps/silvercode/tests/queue-batching.test.tsx
  now covers quick second prompt before backend turn-start, explicit queue flush
  during awaiting-turn-start, prompt echo stripping, and idle recovery: 7/7
  pass. Related reducer/strip/liveness tests: 22/22 pass. Visual
  queue/background/prompt-submit regressions: 20/20 pass. Before: second prompt
  could bypass queue while store still looked idle and overwrite prompt strip
  state; after: controller serializes outbound turns until provider turn
  lifecycle completes."
---

# [x] Silvercode queued prompts leak into transcript and stick thinking #bug #P1

