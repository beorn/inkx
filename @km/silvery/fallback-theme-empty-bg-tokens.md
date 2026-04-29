---
id: "@km/silvery/fallback-theme-empty-bg-tokens"
aliases:
  - km-silvery.fallback-theme-empty-bg-tokens
  - km-silvery-fallback-theme-empty-bg-tokens
created_by: claude:c56dc5d6
created_at: 2026-04-24T06:12:24Z
closed_at: 2026-04-24T06:47:01Z
close_reason: |-
  Fixed by silvery commit 06fb010d.

  Root cause was different from the bead hypothesis: the runtime fallback
  path (packages/ag-term/src/runtime/wrap-with-themed-provider.tsx) was
  importing `detectScheme` from `@silvery/ansi` instead of `@silvery/theme`.
  The ansi entry point returns a Theme without Sterling flat tokens baked
  in. On the fallback branch (confidence=0), every `$bg-*` lookup resolved
  to undefined → null → empty cell paint. Only `$bg-surface-hover` showed
  because it happened to be the one token km-logview set explicitly.

  Fix:
  1. Switch wrap-with-themed-provider.tsx to import from @silvery/theme
     (Sterling-aware wrapper — runs every result through inlineSterlingTokens).
  2. Rename LegacyTheme → Theme in sterling/inline.ts (silvery is too young
     for "legacy" vocabulary).
  3. Add tests/theme-flat-tokens-contract.test.ts with 10 passing assertions
     covering every shipped theme and every Sterling-aware detect path, plus
     a source-assertion on wrap-with-themed-provider to prevent future
     regression.

  Contract test drove the fix (TDD): surfaced the exact discrepancy, failed
  before the fix, green after.

  Known follow-up (not in this commit): move Sterling derivation into
  `@silvery/ansi` so the bare detect functions there also emit flat tokens.
  That kills the "two Theme shapes" architecture entirely. Larger refactor;
  file as a separate bead when prioritized.
---

# [x] fallback default-dark theme leaves 31/32 bg tokens as empty strings @km/silvery #bug #P2

blocks:: [[@km/silvery]]

On terminals where silvery's detection fails (confidence=0 → falls back to 'default-dark'), `bun vendor/silvery/packages/theme/src/cli.ts inspect --format json` shows ALL bg tokens except $bg-surface-hover as empty-string values.

Populated: $bg-surface-hover: #3F4652 (1/32)
Empty-string: $bg-surface-default, $bg-surface-subtle, $bg-surface-raised, $bg-surface-overlay, $bg-muted, $bg-cursor, $bg-accent, $bg-accent-hover, $bg-accent-active, $bg-info(+hover/active), $bg-success(+h/a), $bg-warning(+h/a), $bg-error(+h/a) — 31/32

Empty-string bg resolves to transparent → no cell paint → user sees no bg change. We hit this in @km/logview: user reported every bg-* token 'imperceptible' despite explicit truecolor being set. Investigation confirmed: theme CLI source=fallback, 31/32 bg tokens empty.

Root cause: Sterling's inlineSterlingTokens uses `setIfAbsent` which checks `typeof out[key] !== 'string'`. In the fallback LegacyTheme, token values are stored as objects `{ value: '', monoAttrs: [] }` — not strings — so setIfAbsent overwrites. But the OVERWRITE doesn't happen because some upstream path leaves the value as an empty string.

Fix directions:
1. In default-dark fallback LegacyTheme, ensure all bg-* tokens have non-empty hex defaults derived from the nord/default scheme.
2. Or: have setIfAbsent also overwrite empty strings (not just non-strings).
3. Or: when source=fallback, use the fully-derived default theme instead of a stripped-down one.

Acceptance: after fix, `bun vendor/silvery/packages/theme/src/cli.ts inspect --format json` shows populated values for ALL bg-* tokens when detection fails.