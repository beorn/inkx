---
id: "@km/inbox/yg2ng"
aliases:
  - km-yg2ng
  - "@km/_orphan/yg2ng"
created_by: claude:c9beade3
created_at: 2026-03-13T23:20:39Z
closed_at: 2026-03-13T23:35:48Z
close_reason: "Fixed on feat/cell-type-unification branch: all 5 backends
  updated (text→char, faint→dim, underline:false, new fields). 719 tests pass.
  Close after merge."
owner: bjorn@stabell.org
---

# [x] termless: Cell contract broken across backends @km/_orphan #bug #P0

Found by GPT 5.4 Pro review (2026-03-13).

Files: src/types.ts, packages/alacritty/src/backend.ts, packages/ghostty/src/backend.ts, packages/vt100/src/backend.ts, packages/wezterm/src/backend.ts
Classification: P0

Core expects Cell with char, dim, underline: false|..., underlineColor, blink, hidden, continuation, hyperlink. Several backends return text, faint, underline: 'none', and omit other fields. Breaks views, matchers, serializers, diffing, and SVG rendering for non-xterm backends. 'none' treated as 'underlined' because core tests cell.underline \!== false.

Suggested fix: Define one canonical Cell shape and normalize every backend to it. Add makeCell()/normalizeCell() helper. Add backend conformance test suite.