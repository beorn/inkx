---
id: "@km/themex/vision"
aliases:
  - km-themex.vision
  - km-themex-vision
created_by: claude:f47d1ff0
created_at: 2026-03-04T07:46:13Z
closed_at: 2026-03-04T16:40:34Z
---

# [x] themex: W3C Design Tokens native (with shadcn/Tailwind compatibility) @km/themex #feature #P2 @claude:fbad9cb1

Make themex a first-class W3C Design Tokens citizen — the terminal platform adapter in the Figma→Tokens Studio→Style Dictionary→CSS/Terminal pipeline.

Scope: Color-only W3C integration (33 semantic + 16 ANSI = 49 color tokens). We're a terminal color theme system, not a full design system.

Phases:
1. Token rename: -fg → -foreground (universal naming, prerequisite for clean W3C paths)
2. W3C Design Tokens export: toDesignTokens(theme) → .tokens.json (color type only)
3. W3C Design Tokens import: fromDesignTokens(json) → Theme (reference resolution + gap-filling via deriveTheme)
4. CSS variable export upgrade: toCss(theme) → CSS text (shadcn/Tailwind compatible naming)
5. Style Dictionary plugin (stretch): themex as SD output format

Key decisions:
- W3C standard is the abstraction layer (not shadcn-specific)
- shadcn/Tailwind compatibility is a validation target (CSS export matches their naming)
- Terminal-specific tokens (cursor, selection, inverse, warning, success, info) are strengths
- No shadcn-specific aliases, no web-only tokens (chart, sidebar, ring)

References:
- W3C Design Tokens Format 2025.10: https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/
- Style Dictionary DTCG: https://styledictionary.com/info/dtcg/
- Deep research output: /tmp/llm-af6eb626-1772658000131-tz01.txt