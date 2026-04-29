---
id: "@km/silvery/theme-catalog"
aliases:
  - km-silvery.theme-catalog
  - km-silvery-theme-catalog
created_by: Bjørn Stabell
created_at: 2026-04-18T03:56:49Z
closed_at: 2026-04-18T18:27:39Z
close_reason: Shipped in v0.18.0 — see
  hub/silvery/design/v10-terminal/theme-system-v2-plan.md and silvery v0.18.0
  changelog
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-catalog
    depends_on_id: km-silvery.design-system
    type: parent-child
    created_at: 2026-04-17T20:56:49Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Theme catalog — 30+ bundled themes (Silvery + Dracula / Tokyo Night / Solarized / Gruvbox / Nord / Catppuccin / ...) @km/silvery #feature #P3

blocks:: [[@km/silvery/design-system]]

Ship a catalog of ~35 bundled 22-slot color schemes for direct selection AND for fingerprint-matching in scheme-detect.

## Set

- Silvery: silvery-dark (default), silvery-light
- Top-tier community: dracula, solarized-dark/light, tokyo-night (+storm/light), gruvbox-dark/light, nord, catppuccin (mocha/latte/frappe/macchiato), monokai, one-dark/light, github-dark/light
- Second tier: rose-pine (+moon/dawn), everforest, kanagawa, ayu (dark/mirage/light), material-darker, night-owl
- Terminal defaults: apple-terminal, iterm2-default, ubuntu (shipped), windows-terminal-default, gnome-terminal-default, xterm-default, vga

## Spec

- Each entry: flat { 16 ANSI + 6 semantic + name + dark? + primary? }
- Attribution + license in same file
- Build step precomputes fingerprint hash (fg + bg + ansi[0..15]) for scheme-detect

## Acceptance

- [ ] ≥30 schemes shipped
- [ ] All 22 slots filled
- [ ] Attribution present
- [ ] Fingerprint hashes generated at build time

Full context: hub/silvery/design/v10-terminal/terminal-color-strategy.md
Parent: @km/silvery/design-system
