# Theme unification — one Theme shape, one entry point

**Status**: approved, executing
**Bead**: km-silvery.fallback-theme-empty-bg-tokens (closed), sibling for the finish
**Author**: silvery expert agent, 2026-04-23

## Problem

Silvery ships two Theme shapes:

- **Partial Theme** — what `@silvery/ansi.deriveTheme` / `detectTheme` /
  `detectScheme` return. Has `fg`, `bg`, `primary`, `accent`, `muted`, etc. but
  NO Sterling flat tokens (`$bg-accent`, `$bg-surface-overlay`, `$bg-cursor`,
  `$border-default`, `$fg-muted`, …).
- **Inlined Theme** — what `@silvery/theme.inlineSterlingTokens` produces. The
  partial Theme plus ~20 Sterling flat tokens.

The shape boundary leaks. Every `$bg-*` and `$border-*` token in consumer code
(km-logview, km-tui, silvery components, anyone) implicitly expects the inlined
shape. When a consumer reads `$bg-surface-overlay` off a partial Theme, the
token resolves to `undefined` → `parseColor(null)` → empty-string paint → the
cell renders the terminal's default. "Borders look white," "expanded rows
invisible," "31/32 bg tokens empty."

Commit `06fb010d` patched ONE leak (the runtime's `wrap-with-themed-provider`
now imports from `@silvery/theme`, which inflates themes). But the shape is
still bifurcated:

- `@silvery/ansi.detectTheme` returns partial (direct `@silvery/ansi` consumers
  still see it).
- `@silvery/ansi.deriveTheme` returns partial; `xterm/index.ts` calls
  `deriveTheme(catppuccinMocha)` directly — partial theme, no Sterling tokens.
- `@silvery/ansi`'s `ansi16DarkTheme` / `defaultDarkScheme` constants are
  partial; only the `@silvery/theme` re-exported constants are inlined.
- Contract test catches ONE regression path (runtime wrapper). Misses the
  other 10.

User mandate: "we're too young a framework to tolerate 'legacy' anything." The
partial/inflated split IS the legacy — renaming `LegacyTheme → Theme` didn't
fix the underlying two-shape system.

## Designs considered

### A — Move Sterling INTO `@silvery/ansi`. Kill the shape split at the source.

`@silvery/ansi.deriveTheme` returns an inlined theme. `detectTheme`,
`detectScheme`, `defaultDarkScheme`-derived themes, and `ansi16DarkTheme`
constants all come out inlined. `@silvery/theme` becomes purely the 84 color
scheme catalog + `ThemeProvider` bits. One shape, one entry point.

Cost: move ~1700 LOC from `packages/theme/src/sterling/` to `packages/ansi/src/sterling/`.
Update `deriveTheme` to inline. Delete the transitional wrapper in
`packages/theme/src/detect.ts`. Re-export Sterling types from `@silvery/ansi`.

### B — Keep the split; deprecate `@silvery/ansi`'s detection exports.

Make `@silvery/theme.detectTheme` the only public entry. But `deriveTheme`
would STILL return partial themes, and `xterm/index.ts` (and anyone who wants
raw derivation) still hits it. Doesn't fix the root.

### C — Merge `@silvery/ansi` + `@silvery/theme` into one package.

Tempting. Blocked by: `@silvery/ansi` is the published public surface (v0.19.2
on npm); `@silvery/theme` is `"private": true`. Merging means either:
(a) publish a bigger `@silvery/ansi` that includes the 84 scheme catalog
(bloat for "I just want style primitives" consumers), or (b) publish
`@silvery/theme` and migrate downstream imports — churn without a clear win.

### D — Invert dependency: move theme → ansi/color boundary.

Structurally equivalent to A but phrased as "Sterling is part of the theme
derivation primitive, not a separate opinion layer." Since Sterling's
derivation uses `@silvery/color` (blend, hexToOklch, ensureContrast) and
`@silvery/ansi` already depends on `@silvery/color`, there's no new dep.

## Chosen: A

- `@silvery/theme` is PRIVATE. The shape leaks from `@silvery/ansi` are the
  public failure mode. Fix it at the public surface.
- Sterling's color-math dependency is already transitively in `@silvery/ansi`.
- Only one shape left after the move. No transitional `InlinedTheme` type.
  `Theme` gets Sterling flat tokens baked in and is the only shape.
- The "two packages for a reason" story falls apart under inspection:
  - `@silvery/ansi` already owns `deriveTheme`, `detectTheme`, `loadTheme`,
    `deriveAnsi16Theme`, `auto-generate`, fingerprinting, invariants — i.e.
    the vast majority of theme production code.
  - `@silvery/theme` only owns: 84 scheme data, `builder`, `validate`,
    `css`, `import/export/base16`, and the Sterling subtree. The catalog +
    builder convenience live naturally above ansi; Sterling is derivation.
- km-logview's semantic-workaround comment (`$bg-surface-hover` because
  others were empty) goes away — every bg token resolves on every path.

## Shape of the change

1. `packages/theme/src/sterling/` → `packages/ansi/src/sterling/` (verbatim move).
2. Update internal imports in `sterling/*.ts` (`@silvery/ansi` → relative paths).
3. `@silvery/ansi/src/theme/derive.ts:deriveTheme` inlines Sterling tokens.
   `loadTheme` and `deriveAnsi16Theme` same.
4. `@silvery/ansi` exports: `sterling`, `STERLING_FLAT_TOKENS`, Sterling types.
5. `@silvery/theme/detect.ts` loses the `inlineSterlingTokens` wrapper — it
   becomes a straight re-export from `@silvery/ansi`. Or deleted; `theme.ts`
   re-exports the detection functions directly from `@silvery/ansi`.
6. `@silvery/theme/schemes/index.ts` — the explicit `inlineSterlingTokens(...)`
   calls disappear; `deriveTheme()` does it.
7. `@silvery/theme/sterling/index.ts` — becomes a pure re-export from
   `@silvery/ansi` for back-compat inside the km monorepo. The canonical
   location is `@silvery/ansi`.
8. `wrap-with-themed-provider.tsx` — can import detection from either package
   (no behavior difference). Updated comment to reflect one-shape reality.
9. Contract test extended: assert `@silvery/ansi.detectTheme()` fallback AND
   `deriveTheme(defaultDarkScheme)` both produce Sterling-inlined themes.

## Validation

User's actual complaint: on a 246×122 terminal with detection fallback,
`$bg-surface-overlay`, `$bg-cursor`, `$bg-accent-hover`, `$bg-muted`, `$color8`,
`$bg-accent-active` all empty-string. Under Design A, ALL those tokens resolve
to non-empty hex on every detection path because `deriveTheme` (the final
step in every path — override, probe, fingerprint, fallback) now emits them.

Contract test extensions:
- `@silvery/ansi.detectTheme()` (no-TTY fallback) → all flat tokens populated.
- `@silvery/ansi.detectScheme()` (fallback branch) → all flat tokens populated.
- `deriveTheme(defaultDarkScheme)` → all flat tokens populated.
- `loadTheme(anyScheme)` → all flat tokens populated.
