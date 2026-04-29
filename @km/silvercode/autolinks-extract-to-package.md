---
id: "@km/silvercode/autolinks-extract-to-package"
aliases:
  - km-silvercode.autolinks-extract-to-package
  - km-silvercode-autolinks-extract-to-package
created_by: claude:2405c72e
created_at: 2026-04-26T04:54:51Z
closed_at: 2026-04-26T06:38:16Z
close_reason: "Shipped: 6672788df + 49012d3a9 + 00350484a + a8041af37.
  packages/km-autolinks/ with 165 tests, silvercode imports @km/autolinks
  cleanly, 0 new TS errors. Session: km-session.0425-evening"
---

# [x] Extract apps/silvercode/src/autolinks → packages/km-autolinks @km/silvercode #task #P2 @claude:2405c72e

blocks:: [[@km/silvercode]]

Move silvercode's autolinks code to a shared package so @km/tui (and future website term-linker) can consume it. Rename internal types Autolink*→Syntaxlink* per autolinks=umbrella, syntaxlinks=silvercode subtype. Path: packages/@km/_orphan/autolinks/src/. Tests: packages/@km/_orphan/autolinks/tests/. silvercode imports become @km/autolinks. Parent: @km/all/autolinks-extraction or @km/silvercode.