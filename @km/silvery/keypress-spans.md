---
id: "@km/silvery/keypress-spans"
aliases:
  - km-silvery.keypress-spans
  - km-silvery-keypress-spans
created_by: Bjørn Stabell
created_at: 2026-04-08T23:41:19Z
closed_at: 2026-04-09T05:51:41Z
owner: bjorn@stabell.org
---

# [x] Invisible perf tracking — spans in run(), budget alerts, exit summary @km/silvery #task #P2

Invisible perf tracking. Always on, silent when fine, loud when not.

## Design

silvery:event span wraps each keypress. silvery:render sub-spans for phases. loggily PerfWriter collects durations, checks budget, prints summary on exit. Zero ceremony for app authors. SILVERY_PERF=0 to disable.

## What the consumer sees

- During development: nothing (unless slow)
- On exit: perf: 847 events, p95=8ms
- If regression: slow: j 34ms (budget 16ms) -- content 28ms
- On demand (SILVERY_PERF=verbose): full histogram

## Namespaces

- silvery:event -- keypress to frame complete
- silvery:render -- full render cycle
- silvery:render:layout -- flexily layout
- silvery:render:content -- content phase
- silvery:render:output -- diff + ANSI output

## Implementation

1. loggily: createPerfWriter({ budget }) -- ring buffer + histogram + budget check (~50 LOC)
2. silvery run(): wrap event handler in log.span("event", { key }) (~10 LOC)
3. silvery executeRender(): add phase marks (~10 LOC)
4. silvery withTerminal: auto-attach perfWriter, print summary on exit (~10 LOC)

~80 LOC total across loggily + silvery. Every silvery app gets it free.

## Env vars

- SILVERY_PERF=0 to disable (default: on)
- SILVERY_PERF=verbose for full histogram per event
- TRACE=silvery:render for loggily span output (existing)