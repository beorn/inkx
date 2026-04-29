---
id: "@km/silvery/theme-v3-narrow-cleanups"
aliases:
  - km-silvery.theme-v3-narrow-cleanups
  - km-silvery-theme-v3-narrow-cleanups
created_by: Bjørn Stabell
created_at: 2026-04-19T04:09:18Z
closed_at: 2026-04-19T04:27:35Z
close_reason: Shipped at silvery 47718e69 (N1/N2/N3) + 4dcf66a4 (N4). All 4
  compat shims deleted, types stub removed, 8 brand* aliases dropped,
  detectTheme unified.
---

# [x] Narrow cleanups: compat shims, deprecated aliases, double detectTheme, types stub @km/silvery #task #P3

blocks:: [[@km/silvery/theme-v3-plumbing]]

N1: delete @silvery/theme/{derive,resolve,color,contrast}.ts compat shims (8-line re-exports from @silvery/ansi). N2: delete @silvery/theme/src/types.ts 15-line stub — use @silvery/ansi/theme/types.ts directly. N3: delete deprecated aliases from Theme (brandRed, brandOrange, brandYellow, brandGreen, brandTeal, brandBlue, brandPurple, brandPink) — superseded by short names (red, orange, yellow, etc.). N4: merge @silvery/ansi/theme/detect.ts (lightweight) + @silvery/theme/src/detect.ts (enhanced Nord/Catppuccin fallback) into one detectTheme with fallback option.