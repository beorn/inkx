# Sterling Pre-flight — decisions locked 2026-04-19

**Purpose**: six implementation decisions that shape everything downstream of `sterling-2a-data-layer`. Locked so later phases don't reopen them as scope creep.

**Parent**: [design-system.md](design-system.md).

**Bead**: `km-silvery.sterling-preflight`.

---

## D1 — `destructive` is a component prop, NOT a Theme field

**Question**: does `destructive` live on the Theme object (as `theme.destructive.bg`), or only at the component layer (as a `tone="destructive"` value that resolves internally to `theme.error.bg`)?

**Decision**: **component-layer only.** Theme exposes `error` / `warning` / `success` / `info` / `accent` as base roles. Components that accept a `tone` prop accept `"destructive"` as a synonym that resolves to `error`. Apps can override the mapping per-component but not per-theme.

**Rationale**: if `destructive` is a Theme field, it will drift from `error` over time (different hexes in different schemes, then different derivations, then different semantics) and reintroduce exactly the "which red is which" problem Sterling exists to prevent. Keeping it at the intent layer bakes the mapping at the component API instead of the data layer.

**Consequences**:
- `Theme` type has no `destructive` member
- `@silvery/ui` components with a `tone` prop accept `"error" | "warning" | "success" | "info" | "accent" | "destructive"`; internally `destructive` → `error` lookup
- Design-system.md §"Intent vs role" stays as written; no changes
- Docs lint rule (future): suggest `tone="destructive"` for `<Button>`/`<MenuItem>` with destructive semantics; suggest `tone="error"` for status components

---

## D2 — `info` has independent derivation, same default hex as `accent`

**Question**: does `info.fg` start *exactly equal to* `accent.fg` (alias by reference), or start with the *same hex* but derived independently (so schemes can diverge them)?

**Decision**: **independent derivation, same default hex.** Rules:
- `info.fg = scheme.primary`
- `accent.fg = scheme.primary`

Two separate rules that happen to produce the same value in the default catalog. Scheme authors and apps can override `info.fg` alone without touching `accent.fg`.

**Rationale**: the whole point of giving `info` its own role is semantic distinctness. Aliasing by reference sounds clever but closes the door on future divergence — the first time a scheme author needs a distinct `info` tint (cyan-leaning vs `accent` being blue-leaning, for example), we'd have to break backward compat to un-alias.

**Consequences**:
- Derivation table: explicit `info.fg` / `info.bg` / `info.fgOn` / `info.hover.*` / `info.active.*` rules
- `theme.info.fg === theme.accent.fg` is TRUE by default but not guaranteed by type or derivation
- Schemes can override `info` without touching `accent` (per-role override mechanism)
- `@silvery/ui` components with a `tone` prop include `"info"` as a first-class value

---

## D3 — Contrast guardrails tiered: hard-fail catalog, runtime auto-lift user schemes

**Question**: when a scheme produces a pair that fails WCAG AA (e.g., Gruvbox `warning.fg` on `bg` doesn't reach 4.5:1), do we fail the scheme, auto-lighten until it passes, or log a warning and accept?

**Decision**: **tiered, three rules:**

1. **Build-time catalog test** (the 84 shipped schemes) — all must pass WCAG AA on the core role pairs:
   - `fg` / `bg` for each role (accent, error, warning, success, info, muted)
   - `fgOn` / `bg` for each interactive role
   - `border.focus` / `bg`

   Failure **blocks** the build. Catalog authors must override specific tokens to lift the contrast.

2. **Runtime auto-lift** (for user-authored schemes at runtime) — if a user's scheme produces a pair < AA, auto-adjust via OKLCH lightness shifts (±0.04L increments, up to ~0.20L) until the pair passes. Log at `debug` level. Silent by default.

3. **Explicit override** — scheme authors pin specific tokens in the scheme object (`{red: "#bf616a", "error.fg": "#d08770"}`). Auto-adjustment is skipped for pinned tokens. If the pinned token still fails AA, it's the author's problem; ship as-is.

**Rationale**:
- Catalog schemes are canonical shipped content; they MUST pass. Hard-fail prevents regression.
- User schemes are one-offs; we fix silently rather than erroring (which would make Sterling feel fragile).
- Explicit pins give the escape hatch for aesthetics-over-accessibility edge cases.

**Consequences**:
- `@silvery/design/src/contrast.ts` ships a catalog-test runner invoked in CI
- `deriveFromScheme()` accepts an optional `mode: "strict" | "auto-lift"` parameter; defaults to `auto-lift` for user schemes, `strict` in catalog tests
- Scheme objects support per-role token overrides (already implicit in the 22-color model; explicit typed support)
- Design-system.md §"Derivation guardrails" stays as written

---

## D4 — Flat + nested: double-populate, NOT Proxy

**Question**: single Theme object with BOTH `theme["fg-accent"]` AND `theme.accent.fg`. Do we use a Proxy (reads resolve dynamically), or populate both key forms at derive time (duplicate but explicit)?

**Decision**: **double-populate.** `deriveTheme()` returns a plain object. Each leaf token is written at both paths — same string reference — and the object is frozen.

**Rationale**:
- Proxies break structured cloning (`structuredClone(theme)`), DevTools inspection, JSON serialization — all three are important for theme hot-swap, CSS export, and debugging.
- The extra ~50 object keys cost <2KB per Theme. Negligible in every budget (memory, render perf, bundle size).
- Frozen plain objects are predictable; Proxy behavior surprises people.

**Consequences**:
- `Theme` type is an intersection: `FlatTokens & Roles` (~50 flat hyphen-keys + ~8 role objects)
- `deriveTheme()` builds nested structure first, then flattens onto the same object
- Both access forms compile-time typed (TypeScript string-literal unions for flat keys)
- `Object.keys(theme).length` ≈ 58 (50 flat + 8 role)
- CSS export iterates only the flat hyphen-keys (filter by `.includes("-")`)
- Design-system.md §"Two first-class shapes" stays as written

---

## D5 — OSC 10/11 probe: reuse `@silvery/theme-detect` unchanged

> **Update 2026-04-20 (post-decision):** `@silvery/theme-detect` was killed in
> the run-up to 0.20.0 — the package was always a thin re-export shell of
> `@silvery/ansi` with zero unique code. Probe primitive (`probeColors`,
> formerly `detectTerminalScheme`) lives in `@silvery/ansi`; scheme +
> Sterling-aware theme detection (`detectScheme`, `detectSchemeTheme`,
> `detectTheme`) lives in `@silvery/theme`. The decision below to "reuse the
> probe unchanged" still stands — Sterling consumes `ColorScheme` exactly as
> before; only the import path changed.

**Question**: silvery already has `@silvery/theme-detect` that probes OSC 10/11. Reuse as-is for Sterling, or rewrite for the new Theme shape?

**Decision**: **reuse unchanged.** The probe returns a `ColorScheme` (22 colors) — exactly the same input shape Sterling consumes. No changes needed.

**Rationale**: scheme detection is orthogonal to design-token derivation. The probe's job is "what's the user's terminal palette?" — a question whose answer doesn't change based on whether Sterling or Material-3 is consuming it. Separating these concerns is already correct.

**Consequences**:
- `@silvery/theme-detect` stays at its current API: `detectScheme()` → `ColorScheme`
- Sterling's `deriveFromScheme(scheme)` accepts that directly
- Future `@silvery/design-material` can also consume the same `ColorScheme` input
- No bead needed; zero work in this area

---

## D6 — Clean break at silvery 0.19.0, no deprecation window

**Question**: ship Sterling as silvery `0.19.0` with full break-then-fix (delete `PRIMER_ALIASES`, `LEGACY_ALIASES`, camelCase Theme fields outright), OR ship as `0.19.0-alpha` with a deprecation window first?

**Decision**: **break clean at 0.19.0.** Aliases have been deprecated for weeks; existing silvery users are km and nobody else. No ecosystem to protect yet — the cost of a clean break now is near zero; the cost of dragging compat through future versions is real.

**Rationale**:
- Pre-1.0 semver is explicitly for breaking changes
- Sterling is silvery's design-system story; it deserves the cleanest possible surface
- Every compat alias adds surface area that future maintainers (and LLMs) have to reason about
- km is the only external consumer and lives in the same monorepo; migration is one session

**Consequences**:
- `sterling-2d-release` deletes all aliases in one commit
- silvery CHANGELOG for 0.19.0 has a clear "BREAKING" section with full before/after migration map
- CHANGELOG also links to this doc + design-system.md Appendix C (Sterling ↔ Primer delta)
- No deprecation warnings in the code between 2a and 2d — additive only, then flip
- Version bump: `0.18.x` → `0.19.0`. Major version stays at 0 (pre-1.0)

---

## Summary

| # | Decision | Impact on 2a |
|---|---|---|
| D1 | `destructive` is a component prop, not a Theme field | Theme type: no `destructive` member |
| D2 | `info` derives independently, same default hex as `accent` | Derivation: explicit `info.*` rules |
| D3 | Guardrails: catalog hard-fail, runtime auto-lift, author pin | contrast.ts + catalog test runner |
| D4 | Double-populate Theme (flat + nested), not Proxy | Theme shape: intersection of two forms |
| D5 | Reuse `@silvery/theme-detect` unchanged | No work; separate concern |
| D6 | Clean break at silvery 0.19.0 | 2d deletes all aliases in one commit |

These six are **locked**. Reopening any requires a new pre-flight bead, not a mid-2a pivot. All six feed directly into `sterling-2a-data-layer` as implementation inputs.

---

**Status**: decisions locked 2026-04-19. Closing `km-silvery.sterling-preflight`; unblocking `km-silvery.sterling-2a-data-layer`.
