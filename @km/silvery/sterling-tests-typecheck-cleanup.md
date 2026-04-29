---
id: "@km/silvery/sterling-tests-typecheck-cleanup"
aliases:
  - km-silvery.sterling-tests-typecheck-cleanup
  - km-silvery-sterling-tests-typecheck-cleanup
created_by: claude:22c2717d
created_at: 2026-04-25T07:09:30Z
closed_at: 2026-04-25T07:28:06Z
close_reason: "Shipped: silvery 97306156 + km f5e4d93a9. Both test files
  migrated to Sterling flat-token bracket access. Removed legacy fixture fields
  (primary/primaryfg/muted as strings) from theme-change; replaced
  assertLegacyAccentContrast with assertAccentContrast using
  fgAccent/bgAccent/fgOnAccent helpers. Fixed bonus logic bug: autoGenerateTheme
  contrast loop was comparing fg-on-accent vs fg-accent (text vs text); now
  correctly compares fg-on-accent vs bg-accent (text on filled surface). Tests:
  1447/1447 pass. Typecheck clean for both files (24 NEW errors → 0)."
---

# [x] Migrate vendor/silvery/tests/{theme-change,theme-contrast} to Sterling Theme shape @km/silvery #task #P3 @claude:22c2717d

blocks:: [[@km/all/sterling]]

After Sterling 0.20.0 made Theme = SterlingTheme, two test files in vendor/silvery/tests/ still use the legacy Theme shape:

- vendor/silvery/tests/theme-change.test.tsx — 12 TS errors (uses \`muted: string\` instead of \`muted: MutedRole\`)
- vendor/silvery/tests/theme-contrast.test.ts — 12 TS errors (uses \`theme.primary\`, \`theme.primaryfg\`, \`theme.accent\`, etc.)

Tests PASS at runtime (legacy emit still populates these fields), but TypeScript-strict type-check fails. They block 'bun run test:fast' until the typecheck baseline gate is satisfied.

## Root cause

Phase F (sterling-package-tests-sweep) explicitly punted on these:
> Other legacy refs (primary/accent/muted/cursor) intentionally retained — still emitted by deriveTheme. Recommend a follow-up bead if 0.22.0 plans to drop those roots.

Phase F's scope was just selection/inverse/link migration. The full primary/accent/muted purge needs its own session.

## Fix

Migrate the two test files to read Sterling tokens via bracket access:
- \`theme.primary\` → \`theme["fg-accent"]\` or \`theme["bg-accent"]\` (per-site)
- \`theme.primaryfg\` → \`theme["fg-on-accent"]\`
- \`theme.muted\` (string) → \`theme.muted.fg\` or \`theme["fg-muted"]\`
- \`theme.accent\` (string) → \`theme["fg-accent"]\` or \`theme.accent.fg\`
- etc.

## Acceptance

- \`bash packages/km-infra/scripts/typecheck/check.sh\` reports zero NEW errors in vendor/silvery/tests/theme-change.test.tsx and theme-contrast.test.ts
- \`bun vitest run vendor/silvery/tests/theme-change.test.tsx vendor/silvery/tests/theme-contrast.test.ts --project vendor\` passes
- bun run test:fast green (modulo other-session unrelated failures)

## Out of scope

The bigger \"purge primary/accent/muted/cursor legacy emit at runtime\" — that's a 0.22.0 concern with ~100+ JSX consumer migrations.