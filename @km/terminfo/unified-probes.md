---
id: "@km/terminfo/unified-probes"
aliases:
  - km-terminfo.unified-probes
  - km-terminfo-unified-probes
created_by: claude:4929065a
created_at: 2026-03-25T21:29:49Z
closed_at: 2026-03-25T22:09:06Z
close_reason: "Done: packages/probe-defs/ with 133 probe definitions. Each has
  termless (sync cell-state) and term (async TTY) callbacks. Vitest adapter at
  packages/probes/run-unified.probe.ts (926 pass, 138 expected fail — matches
  originals). CLI adapter at cli/src/probes/unified.ts."
---

# [x] Unified probe system — define once, run on termless + CLI + app + server @km/terminfo #feature #P2 @claude:4929065a

Currently 4 separate probe implementations with different APIs:
1. packages/probes/*.probe.ts — termless (Vitest, cell-state verification)
2. cli/src/probes/index.ts — npm CLI (DSR-based, raw TTY)
3. packages/cli/src/app-harness.ts — app launcher (DSR-based, different format)
4. packages/cli/src/here.ts — inline TTY (reuses CLI probes)

They're now at parity (134 probes each) but maintaining 4 copies is fragile. A unified system would:
- Define each probe ONCE with metadata (id, name, category, baseline)
- Provide two verification strategies: cell-state (headless) and DSR (real terminal)
- Auto-generate probe implementations for each runner
- Make gap detection impossible — if a probe exists, it runs everywhere

Design: A single probes definition file that exports probe descriptors. Each descriptor has a 'headless' function (uses getCell/getMode) and a 'tty' function (uses DSR/readResponse). The runners import and execute the appropriate function.