---
mentions:
  - km
id: "@km/termless/fix-kitty-build"
aliases:
  - km-termless.fix-kitty-build
  - km-termless-fix-kitty-build
created_by: claude:4929065a
created_at: 2026-03-23T21:48:07Z
closed_at: 2026-03-23T22:21:55Z
close_reason: "Done: Python subprocess bridge via kitty +runpy. 53/61 (87%).
  Only backend with kitty-graphics."
owner: bjorn@stabell.org
---

# [x] Implement kitty backend C parser extraction @km/termless #task #P3

kitty build.sh is a TODO stub. Need to extract the VT parser from kitty source (parser.c, screen.c, data-types.h) and compile via napi-rs or C FFI.

