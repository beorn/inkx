---
id: "@km/silvery/theme-detect-standalone"
aliases:
  - km-silvery.theme-detect-standalone
  - km-silvery-theme-detect-standalone
created_by: Bjørn Stabell
created_at: 2026-04-18T07:08:18Z
closed_at: 2026-04-18T18:27:18Z
close_reason: "Shipped in v0.18.0: @silvery/theme-detect@0.18.0 published to npm
  (first release). Re-export package: detection (detectTerminalScheme,
  detectScheme, detectSchemeTheme, BgMode), fingerprinting (fingerprintMatch,
  fingerprintCandidates), derivation (deriveTheme, loadTheme), invariants,
  monochrome attrs, custom tokens, types. Zero framework deps beyond
  @silvery/color + @silvery/ansi. 14 export-verification + end-to-end tests
  pass."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-detect-standalone
    depends_on_id: km-silvery.design-system
    type: parent-child
    created_at: 2026-04-18T00:08:18Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Theme detection as standalone library — useful beyond silvery @km/silvery #feature #P3

blocks:: [[@km/silvery/design-system]]

Extract Layer 3 of the design system as @silvery/theme-detect — framework-agnostic library consumable by any TUI/CLI.

## Per /pro review: extract at ColorScheme boundary, not Theme boundary

Layer 3 decomposes into two halves. The reusable asset is **terminal scheme detection**, NOT silvery's theme mapping.

```
detectScheme() → ColorScheme (22 slots) + confidence   ← REUSABLE (all TUI frameworks)
                     ↓
schemeToTheme() → silvery Theme (20 tokens)            ← silvery-specific, stays in silvery
```

Exporting `autoDetect(): Theme` locks to silvery tokens — less reusable. Exporting `detectScheme(): ColorScheme` is broadly useful; any TUI can wrap it.

## API surface (@silvery/theme-detect)

```ts
// Core primitives
detectCapability()    → { tier, source, overrides }  // truecolor/256/ANSI16/mono detection
probeTerminal(opts?)  → Partial<ColorScheme> + diagnostics  // raw OSC probing
detectScheme(opts?)   → { scheme, source, confidence, slotSources }  // full resolution

// Derivation helpers
fingerprintMatch(probed, catalog) → { match, delta, confidence }
fillMissingSlots(partial) → ColorScheme  // formula derivation (Tier C)
generateScheme(partial) → ColorScheme    // synthesize from fg/bg or seed

// Types
ColorScheme           // 22-slot type (16 ANSI + 6 semantic + metadata)
DetectionResult       // confidence + provenance per slot
```

## Consumers

- silvery (internal) — composes schemeToTheme on top
- Ink / Bubbletea / React-Ink-compat apps — import detectScheme
- Theme editors + pickers — use fingerprintMatch + catalog
- CLI/REPL apps — brief probe at startup
- Other TUIs: lazygit, btop, k9s (if they want)

## Packaging

- Zero framework deps (just color math + ANSI/OSC primitives)
- Works on Node + Bun + Deno
- Published separately at npm as `@silvery/theme-detect`
- Silvery depends on it internally
- Documented at silvery.dev/theme-detect (own page, indie library brand)

## Acceptance

- [ ] detectScheme() returns ColorScheme + confidence + slotSources
- [ ] No silvery-framework-specific dependencies
- [ ] Extractable from silvery internals with thin public API
- [ ] Example: Ink app consuming it for theme-adaptive rendering
- [ ] Docs at silvery.dev/theme-detect

## Related

- Parent: @km/silvery/design-system
- Depends on: @km/silvery/theme-auto-detect (implementation)
- Depends on: @km/silvery/theme-generators (implementation)
- Depends on: @km/silvery/theme-catalog (scheme data for fingerprinting)
- Depends on: @km/silvery/color-oklch (OKLCH math)

Per /pro review 2026-04-18: 'extract at the ColorScheme boundary, not Theme boundary' is the right call for cross-framework reusability.