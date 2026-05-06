---
mentions:
  - km
id: "@km/silvery/theme-public-docs"
aliases:
  - km-silvery.theme-public-docs
  - km-silvery-theme-public-docs
created_by: Bjørn Stabell
created_at: 2026-04-18T05:37:43Z
closed_at: 2026-04-18T18:27:23Z
close_reason: "Shipped in v0.18.0: silvery.dev/guide × 4 — color-schemes.md,
  capability-tiers.md, custom-tokens.md, token-taxonomy.md (NEW: full decision
  tree for all 6 token categories with anti-patterns). terminfo.dev/fundamentals
  × 3 — color-fundamentals.md, color-schemes.md, color-detection.md. All
  cross-linked. VitePress sidebar entries + transformPageData SEO metadata."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-public-docs
    depends_on_id: km-silvery.design-system
    type: parent-child
    created_at: 2026-04-17T22:37:44Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.design-system
---

# [x] Theme public docs — silvery.dev guides + terminfo.dev fundamentals @km/silvery #feature #P3

blocks:: [[@km/silvery/design-system]]

Publish color strategy content on silvery.dev + terminfo.dev. Internal doc stays in hub/silvery/; public docs distill from it (no duplication).

## silvery.dev (vendor/silvery/docs/guide/)

- **color-schemes.md** (NEW) — 22-slot scheme, deriveTheme model, bundled schemes, how to pick/author
- **capability-tiers.md** (NEW) — truecolor/256/ANSI16/mono tiers, SILVERY_COLOR, degradation
- **custom-tokens.md** (NEW) — defineTokens API, derivation vs brand patterns
- **styling.md** (update) — cross-link to above

## terminfo.dev (content/)

- **/guide/color-fundamentals** (NEW) — ANSI/256/truecolor, SGR vs OSC, rendering basics
- **/guide/color-schemes** (NEW) — 22-slot user-configurable scheme, cross-emulator
- **/guide/color-detection** (NEW) — NO_COLOR, COLORTERM, OSC probes

Cross-link silvery.dev ↔ terminfo.dev for related topics.

## Acceptance

- [ ] 3 silvery.dev guides exist
- [ ] 3 terminfo.dev fundamentals pages exist
- [ ] Cross-links in place
- [ ] No duplication with internal doc

Full context: hub/silvery/design/v10-terminal/terminal-color-strategy.md
Parent: @km/silvery/design-system

