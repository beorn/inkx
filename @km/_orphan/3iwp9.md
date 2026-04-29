---
id: "@km/_orphan/3iwp9"
aliases:
  - km-3iwp9
created_by: claude:efb76293
created_at: 2026-03-17T07:38:54Z
closed_at: 2026-03-17T07:56:39Z
close_reason: "Implemented: findInheritedFg returns $fg when inside Box theme={}
  subtree. Zero test failures."
---

# [x] Pipeline: findInheritedFg falls back to $fg from active theme @km/_orphan #task #P1

Make findInheritedFg() in content-phase.ts return parseColor('$fg') instead of null when no ancestor Box sets color. This ensures text uses the theme's fg by default, making ThemeProvider zero-ceremony (no wrapper Box needed).

Requires updating ~300 vendor test assertions that check exact ANSI frame output — they now include an explicit fg SGR code where before they relied on the terminal default.