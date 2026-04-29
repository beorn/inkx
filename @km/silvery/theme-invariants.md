---
id: "@km/silvery/theme-invariants"
aliases:
  - km-silvery.theme-invariants
  - km-silvery-theme-invariants
created_by: Bjørn Stabell
created_at: 2026-04-18T07:01:46Z
closed_at: 2026-04-18T18:27:46Z
close_reason: Shipped in v0.18.0 — see
  hub/silvery/design/v10-terminal/theme-system-v2-plan.md and silvery v0.18.0
  changelog
---

# [x] Theme invariants — AA contrast + gamut mapping enforced at theme load @km/silvery #feature #P3 @Bjørn Stabell

blocks:: [[@km/silvery/design-system]]

Every theme (bundled or authored) must pass accessibility + correctness invariants before being used. Enforced at theme load, not just at render time.

## Invariants to enforce

- WCAG AA contrast (4.5:1) for critical pairs: fg-default on bg-default, fg-on-emphasis on bg-emphasis, each state fg on bg-default
- WCAG Large (3:1) for fg-muted, fg-subtle, border-emphasis
- Selection visibility: selection-bg must differ from bg-subtle by ΔL ≥ 0.15 AND maintain fg-default contrast
- Cursor visibility: cursor-fg vs bg-default ΔE ≥ 20 (OKLCH)
- Gamut: every OKLCH value must map cleanly to sRGB; if out of gamut, reduce C preserving L and H until in-gamut
- Post-quantization check: a theme that passes AA in OKLCH can fail after 256-color cube quantization — re-check invariants per tier

## Behavior

- Theme load runs invariant check
- Failures: throw with actionable error ('fg-muted #X on bg-default #Y is 2.8:1, needs 3:1') or auto-adjust (nudge L until passes)
- Config: strict (throw) vs lenient (auto-adjust + warn)
- Bundled themes pre-validated at build time

## API

```ts
const theme = loadTheme(raw, { mode: 'strict' | 'lenient' })
// throws or adjusts + returns adjustments array
```

## Acceptance

- [ ] Invariant table defined with specific targets per token pair
- [ ] loadTheme() runs checks, returns theme + adjustments[]
- [ ] Strict mode throws; lenient mode auto-adjusts
- [ ] Bundled themes validated at build time (CI)
- [ ] Per-tier re-check (post-quantization, post-ANSI16-fallback)
- [ ] Gamut mapping: OKLCH out-of-sRGB → reduce C, preserve L+H
- [ ] Documented in hub/silvery/design/v10-terminal/terminal-color-strategy.md

Parent: @km/silvery/design-system
Reference: hub/silvery/design/v10-terminal/terminal-color-strategy.md
Source: /pro review 2026-04-17