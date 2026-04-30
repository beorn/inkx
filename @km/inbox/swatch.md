---
id: "@km/inbox/swatch"
aliases:
  - km-swatch
  - "@km/_orphan/swatch"
created_by: claude:66437c43
created_at: 2026-03-03T12:47:19Z
closed_at: 2026-03-07T02:12:09Z
close_reason: "Grooming: 100% children closed, package complete in vendor/swatch/"
owner: bjorn@stabell.org
---

# [x] swatch: universal color theme package @km/_orphan #epic #P2

swatch: universal color theme system.

## Architecture

```
Palette Generators  →  ColorPalette (22)  →  Theme (33)
from*() functions      16 ANSI + fg/bg/      shadcn-style pairs
                       cursor/selection       $name / $namefg
```

Four concepts:
1. **Palette generators** — from*() functions (fromBase16, fromOSC, fromColors, fromPreset)
2. **ColorPalette** — the 22 terminal colors (de facto standard)
3. **Theme** — 33 semantic tokens with consistent shadcn-style pairing
4. **Theme system** — swatch, the package that connects it all

## Completed
- Phase 1-6: Package skeleton, 45 palettes, hightea migration, CLI, VitePress docs
- Phase A: Core types + derivation (ColorPalette 22 + Theme 33)
- Phase B: Palette generators (fromBase16, fromColors, fromPreset)
- Phase C: Convert 45 built-in palettes to ColorPalette format
- Phase D: Token resolution + state + registry
- Phase E: hightea migration (new Theme shape, 33 tokens)
- Phase F: @km/tui token migration