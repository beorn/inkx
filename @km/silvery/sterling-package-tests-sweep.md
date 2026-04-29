---
id: "@km/silvery/sterling-package-tests-sweep"
aliases:
  - km-silvery.sterling-package-tests-sweep
  - km-silvery-sterling-package-tests-sweep
created_by: claude:a1a0e667
created_at: 2026-04-20T22:16:41Z
closed_at: 2026-04-25T07:04:00Z
close_reason: "Phase F shipped: silvery d5b23cf9 + km afbe9f89a. Audit found ~17
  actual uses (vs bead's 137 — most cleaned up incidentally during Phase D). 2
  test files migrated. Other legacy refs (primary/accent/muted/cursor)
  intentionally retained — still emitted by deriveTheme."
---

# [x] Sweep legacy theme tokens in vendor/silvery/packages/*/tests/ (~137 uses) — rewrite test expectations alongside 0.20.0 inlineSterlingTokens drop @km/silvery #task #P3 @claude:22c2717d

blocks:: [[@km/all/sterling]], [[@km/silvery/sterling-2e-interior-migration]]

Created from @km/silvery/sterling-tests-legacy-sweep DONE evidence (closed by tests-sweep agent 2026-04-20). The original bead miscounted: '~140 hits' was actually 137 in vendor/silvery/packages/*/tests/, not 3 in vendor/silvery/tests/.

The 137 hits in per-package tests are NOT a simple rename — they test the resolver path, legacy aliases, deprecation surface, and the Sterling double-population shim (inlineSterlingTokens). Renaming them today would silently delete coverage of the layer 0.20.0 is going to REMOVE.

## Scope
- vendor/silvery/packages/*/tests/ — 137 legacy-token uses
- Materially different from tests/ sweep: rewriting test expectations + assertions, not mechanical renames
- Must happen ALONGSIDE the inlineSterlingTokens drop, not before

## Blocks
- 0.20.0 release (inlineSterlingTokens removal — Phase F-final per @km/silvery/sterling-2e-interior-migration notes)

## Acceptance
- After inlineSterlingTokens runtime shim removed
- vendor/silvery/packages/*/tests/ legacy-token uses → 0 hits (or only documented exceptions)
- All package test suites pass with the new shape
- Coverage of the resolver/deprecation/aliasing layer either ported or intentionally retired