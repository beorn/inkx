---
id: "@km/inbox/wze2d"
aliases:
  - km-wze2d
  - "@km/_orphan/wze2d"
created_by: claude:f8196c1c
created_at: 2026-03-23T20:03:17Z
closed_at: 2026-03-23T22:39:27Z
close_reason: "Done: Bun.build() script with 24 targets. silvery 264KB gzip, tea
  106KB, test 89KB. Dual-mode exports (bun→TS, import→JS). dist/ gitignored."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Bundle silvery packages into pre-built JS (like Ink 5) @km/_orphan #task #P1 @claude:fed8de9e

Ink 5 bundles all 24 deps into build/ — 696KB total, zero hoisted packages. silvery ships TypeScript source (~2.1MB). Bundle with esbuild into pre-built JS to match or beat Ink's install footprint. This also means faster startup (no TS compilation) and better compatibility (works with plain Node.js, not just Bun/tsx).