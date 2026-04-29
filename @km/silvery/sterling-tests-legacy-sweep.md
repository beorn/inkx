---
id: "@km/silvery/sterling-tests-legacy-sweep"
aliases:
  - km-silvery.sterling-tests-legacy-sweep
  - km-silvery-sterling-tests-legacy-sweep
created_by: claude:a1a0e667
created_at: 2026-04-20T21:46:21Z
closed_at: 2026-04-20T22:23:56Z
close_reason: >-
  Sweep complete. Hits 136 → 77 (all remaining are documented exceptions).


  Renamed legacy theme tokens to Sterling flat-token equivalents in 7 test
  files:
    - components/table.test.tsx
    - features/run-color-level.test.tsx
    - features/termless-coverage.test.tsx
    - features/theme-provider-cascade.test.tsx
    - features/typography.test.tsx
    - hooks/useColorScheme.test.tsx
    - theme-change.test.tsx

  For tests with custom theme constructors, both legacy and Sterling flat keys

  are now pinned on the test theme so JSX using either token shape resolves

  to the same RGB.


  Three files retain legacy tokens by design and are documented inline with

  NOTE blocks pointing at this bead:
    - features/mono-tier-attrs.test.tsx (49 hits) — tests legacy
      DEFAULT_MONO_ATTRS keying; Sterling parity covered by
      packages/ansi/tests/monochrome.test.ts.
    - features/variants.test.tsx (28 hits) — tests variant↔direct-color
      parity via legacy DEFAULT_VARIANTS (h1.color = "$primary").
    - features/state-variants.test.tsx (16 hits, separately matched on
      *-hover/*-active suffixes) — tests legacy deriveTheme() state-variant
      rule.

  These three should be retired or rewritten when 0.20.0 drops the

  inlineSterlingTokens runtime shim, NOT mechanically renamed.


  Verification:
    bun vitest run --project vendor [11 changed/related test files]
      → 11/11 files passed, 183/183 tests passed.

  Commits:
    silvery 0bfb3e0f — chore(tests): rename legacy theme tokens to Sterling flat tokens
    km a80569638 — chore(silvery): bump 0bfb3e0f — sterling tests legacy sweep

  Originally gated on 0.20.0; doing this now removes the 0.20.0 blocker for

  the 7 mechanically-migrated files. The 3 remaining files become the

  deletion/rewrite work item for 0.20.0.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.sterling-tests-legacy-sweep
    depends_on_id: km-silvery.theme-v4
    type: parent-child
    created_at: 2026-04-20T14:46:21Z
    created_by: claude:a1a0e667
    metadata: "{}"
---

# [x] Sweep legacy theme tokens in silvery/tests/ (~140 uses) — gated on 0.20.0 runtime-shim drop @km/silvery #task #P3

blocks:: [[@km/silvery/theme-v4]]

Out-of-scope follow-up from @km/silvery/sterling-consumer-migration (closed 2026-04-20). 

migration agent's final regex confirmed 1486→70 in apps/@km/tui/src + vendor/silvery/packages/ag-react/src. Remaining 70 are documented exceptions (selection/link/inverse — Sterling has no equivalent role yet).

vendor/silvery/tests/ has ~140 legacy-token uses still in place. These test the legacy-aliasing layer (inlineSterlingTokens runtime double-population) which Sterling 0.19.0 keeps. The sweep makes sense ONLY when 0.20.0 drops inlineSterlingTokens and the tests need to be ported to the new shape.

## Acceptance
- After 0.20.0 ships dropping inlineSterlingTokens runtime shim
- vendor/silvery/tests/ legacy-token uses → 0 hits (or only documented exceptions)  
- Test outputs match Sterling-resolved hex values

## Blocked by
- (Implicitly) Sterling 0.20.0 release with inlineSterlingTokens drop

## Not blocked by anything in current state — purely a future-work tracker.