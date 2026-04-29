---
id: "@km/silvery/theme-system-v2"
aliases:
  - km-silvery.theme-system-v2
  - km-silvery-theme-system-v2
created_by: Bjørn Stabell
created_at: 2026-04-18T17:44:05Z
closed_at: 2026-04-18T19:19:17Z
close_reason: "All 9 child beads closed. v2 ships: Primer aliases, tokens-prop
  ThemeProvider, brand+ring tokens, mono-tier wiring, color='inherit' cascade,
  runThemed boot, typed ThemeToken union, state-variants (hover/active OKLCH),
  variants-as-tokens (typography presets). km-tui.coloroverride-purge follow-up
  also closed (36 sites migrated)."
---

# [x] Theme System v2 — Primer names, tokens-prop ThemeProvider, standard brand tokens, mono wiring, variants-as-tokens, color inherit, state variants, typed tokens, createThemedApp @km/silvery #task #P2

blocks:: [[@km/silvery/design-system]]

Follow-up epic to @km/silvery/design-system after the v1 16 beads shipped. Captures what's left to make the theme system feel truly complete and ergonomic.

Full design: hub/silvery/design/v10-terminal/theme-system-v2-plan.md

## 9 child beads (in dependency order)

1. token-rename-primer — Ink-style compound names → Primer-style (muted→fg-muted, mutedbg→bg-muted, disabledfg→fg-disabled, focusborder→border-focus, inputborder→border-input, surfacebg→bg-surface, popoverbg→bg-popover, inversebg→bg-inverse, selectionbg→bg-selected, cursorbg→bg-cursor). ~200 refs, mechanical, keep aliases for 1 release.

2. tokens-prop-provider — <ThemeProvider tokens={{...}}>: sparse or full, merged over defaults. Unifies 'theme' and 'customTokens' props into one bag. Migration path with both APIs for one release.

3. brand-tokens-standard — $brand + $brand-hover/-active + $brand-red/orange/yellow/green/teal/blue/purple/pink as standard theme tokens. Auto-derived from scheme (Apple system-color model). Apps override $brand; auxiliary ring still auto-rotates.

4. mono-tier-wiring — output phase emits SGR attrs per-token at colorLevel='none'. monoAttrsFor(theme, token) already exists; nothing in pipeline calls it. Finishes broken promise.

5. variants-as-tokens — <Text variant='h1'> resolved from theme. Typography presets become first-class tokens (h1/h2/h3/body/body-muted/fine-print/strong/em/link/key/code/kbd). H1..Small React components keep working as thin wrappers.

6. color-inherit — <Text color='inherit'> and 'currentColor' primitives resolved via AgNode cascade. Retires @km/tui colorOverride hack. 3 consumer migrations.

7. state-variants — $primary-hover/-active, $fg-hover/-active, etc. via ±0.04L/±0.08L OKLCH derivation. Silvery's Kitty mouse already tracks hover; just needs token names.

8. typed-tokens-matchers — TypeScript-enforced ThemeToken union (with string & {} escape hatch for tokens starting with $). Test matchers: toHaveToken, toResolveToken, toUseToken.

9. create-themed-app — createThemedApp({ catalog }, <App />) one-line boot. Composes detectScheme + ThemeProvider + terminal + react + focus + dom-events. createApp + pipe stays for custom composition.

## Scope boundaries

Each child is its own bead. This epic is the umbrella + coordination. Close when all 9 children close.

Parent: @km/silvery/design-system (v1 completion parent)