---
id: "@km/silvery/theme-mono"
aliases:
  - km-silvery.theme-mono
  - km-silvery-theme-mono
created_by: Bjørn Stabell
created_at: 2026-04-18T04:01:52Z
closed_at: 2026-04-18T18:27:48Z
close_reason: Shipped in v0.18.0 — see
  hub/silvery/design/v10-terminal/theme-system-v2-plan.md and silvery v0.18.0
  changelog
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-mono
    depends_on_id: km-silvery.design-system
    type: parent-child
    created_at: 2026-04-17T21:02:08Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Theme monochrome — per-token attrs theme for NO_COLOR / dumb terminals (accessibility feature) @km/silvery #feature #P3

blocks:: [[@km/silvery/design-system]]

Accessibility feature — when color is unavailable (NO_COLOR, TERM=dumb, SILVERY_COLOR=mono), silvery apps remain hierarchical via per-token SGR attrs.

## Spec

Every token has a mapped attrs set at the monochrome tier. Preserves state distinction and emphasis hierarchy without color.

## Attrs table (Polaris-aligned token names)

| Token | attrs |
|---|---|
| text-default, bg-*, border-default, cursor-* | [] |
| text-secondary, text-subdued, text-disabled | ["dim"] |
| text-brand | ["bold"] |
| text-link | ["underline"] |
| text-critical | ["bold", "inverse"] |
| text-caution | ["bold"] |
| text-success | ["bold"] |
| text-info | ["italic"] |
| text-on-bg-fill | [] (bg-fill-X handles its own emphasis) |
| text-inverse | ["inverse"] |
| border-focus | ["bold"] |
| border-critical | ["bold"] |
| bg-selected | ["inverse"] |
| bg-fill-critical | ["inverse"] |
| bg-fill-caution | ["bold"] |
| bg-fill-success, bg-fill-info | ["bold"] |

Universally-supported SGR subset: bold, dim, italic, underline, inverse, strikethrough.

## Option B chosen

Over simple 'strip color + preserve preset attrs' (Option A). B gives state-colored content genuine distinguishability without color, which is the accessibility feature worth shipping.

## Acceptance

- [ ] deriveMonochromeTheme(theme) returns Theme with attrs per token
- [ ] NO_COLOR / TERM=dumb / SILVERY_COLOR=mono routes here
- [ ] Snapshot tests cover monochrome rendering of showcase components
- [ ] State distinction visible in monochrome (error vs warning vs success distinguishable via attrs)
- [ ] Documented in hub/silvery/design/v10-terminal/terminal-color-strategy.md

Full context: hub/silvery/design/v10-terminal/terminal-color-strategy.md
Parent: @km/silvery/design-system