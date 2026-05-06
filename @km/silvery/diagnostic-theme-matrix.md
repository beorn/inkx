---
aliases:
  - km-silvery.diagnostic-theme-matrix
  - km-silvery-diagnostic-theme-matrix
created_at: 2026-05-06T06:07:04.248Z
---

# Diagnostic theme + fallback theme matrix in pipeline regression tests #P2

The diagnostic theme is shipped (vendor/silvery/packages/test/src/diagnostic-theme.ts) and exported from @silvery/test. apps/km-tui/tests/render-cyan-strip-cold-start-82.slow.spec.ts runs at [diagnostic, nord, tokyo-night, default-dark]. Extend this pattern to other pipeline regression tests where token-color collapse could mask bugs (golden-vault-frame, render-light-blue-strip-residue, bg-leak detectors). Document the matrix in apps/km-tui/tests/CLAUDE.md as the new default for regression tests targeting visible-pixel correctness.
