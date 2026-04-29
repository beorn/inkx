---
id: "@km/silvery/tokens-prop-provider"
aliases:
  - km-silvery.tokens-prop-provider
  - km-silvery-tokens-prop-provider
created_by: Bjørn Stabell
created_at: 2026-04-18T17:45:09Z
closed_at: 2026-04-18T18:27:03Z
close_reason: "Shipped in v0.18.0: <ThemeProvider tokens={{...}}> unified API.
  Sparse merge over parent context, full replace, custom tokens coexist with
  standard. 6 new tests. Legacy theme= prop still works (deprecated for next
  major). vendor/silvery/packages/ag-react/src/ThemeProvider.tsx +
  theme-provider-tokens.test.tsx"
---

# [x] <ThemeProvider tokens={{…}}> — unified sparse/full token bag @km/silvery #task #P3

blocks:: [[@km/silvery/theme-system-v2]]

New ThemeProvider API. Replace theme + customTokens with a single tokens prop that accepts partial or full Theme + custom token extras, merged over the detected defaults.\n\nAPI:\n  <ThemeProvider tokens={{ primary: '#FF0', 'priority-p0': { derive: s => s.brightRed } }}>\n\nResolution: tokens prop → scheme-derived defaults → hardcoded fallback.\n\nBackwards-compat: theme= and customTokens= keep working for one release, emit deprecation warning in dev.\n\nDepends on: nothing (standalone)\nSpec: hub/silvery/design/v10-terminal/theme-system-v2-plan.md#p2