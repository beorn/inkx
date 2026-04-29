---
id: "@km/terminfo/shared-components"
aliases:
  - km-terminfo.shared-components
  - km-terminfo-shared-components
created_by: claude:f8196c1c
created_at: 2026-03-25T23:18:45Z
closed_at: 2026-03-25T23:27:33Z
close_reason: "Consistent tooltips across all 5 page types: terminal headers
  (description+type+version+URL), feature names (tags+spec), result cells
  (colored backgrounds), scorecard bars (segment counts), compare headers
  (tooltips+links). Removed local CSS overrides blocking shared
  result-cells.css."
---

# [x] Standardized reusable table components across all terminfo.dev pages @km/terminfo #task #P2 @claude:f8196c1c

Currently each page template (index.md, terminal/[id].md, baseline/[id].md, compare/[id].md, [id].md) has its own table rendering with inconsistent features:

- Matrix (index.md): has tooltips on terminal names, bar segment popovers, platform icons
- Terminal pages: have tooltips on features, notes column
- Baseline pages: MISSING tooltips on terminal names, MISSING bar popovers
- Compare pages: have tooltips on results, no terminal name tooltips
- Category/standard pages: have tooltips on results

Need: shared Vue components or at least shared patterns that ensure every table has:
1. Terminal name tooltips (description, version, type)
2. Feature name tooltips (tags, spec URL)
3. Result cell tooltips (notes, annotations)
4. Progress bar tooltips (segment breakdown)
5. Platform icons
6. Consistent hover-link styling

VitePress doesn't support Vue SFC components in markdown easily, but we can:
- Use shared CSS (already have tooltip.css, result-cells.css, analysis.css)
- Use shared JS helper functions (tooltip generators)
- Document the canonical pattern for each element type