---
mentions:
  - km
id: "@km/terminfo/bright-contrast"
aliases:
  - km-terminfo.bright-contrast
  - km-terminfo-bright-contrast
created_by: Bjørn Stabell
created_at: 2026-04-17T23:35:44Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-terminfo.bright-contrast
    depends_on_id: km-terminfo
    type: parent-child
    created_at: 2026-04-17T16:35:58Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-terminfo
---

# [ ] Capture per-terminal contrast between standard and bright colors @km/terminfo #feature #P3

blocks:: [[@km/terminfo]]

## Context

terminfo.dev currently tracks bright-color SUPPORT (sgr.fg.bright = boolean)
but not whether standard and bright colors are VISUALLY distinct on a given
terminal. In practice many terminals render SGR 37 (white) ≈ SGR 97
(whiteBright) indistinguishably — which breaks UI libraries that use $muted
(ANSI white) to mean "visibly grey" because it reads the same as $fg
(whiteBright).

## What to add

A new feature (or probe extension) that captures actual rendered RGB for
each of the 16 standard/bright color pairs, plus the ΔE (or simpler
luminance-delta) between them:

sgr.fg.bright-contrast.<color>:
    standard: [R, G, B]       # SGR 30-37
    bright: [R, G, B]          # SGR 90-97
    deltaE: <number>           # perceptual distance
    luminance_delta: <number>  # simpler Y-only delta

At minimum for white/whiteBright and black/blackBright (the two pairs that
drive the grey ladder used by UI theming).

## Why palette-dependent is OK

Themes customize the palette — Ghostty-with-Catppuccin renders differently
than Ghostty-with-default. That's fine: the capture reflects what the user
CURRENTLY sees. For cross-terminal analysis, aggregate by (terminal, theme)
pair or by "default palette" probes.

## Downstream use (why this matters)

- Silvery's \$muted token = ANSI white. On terminals where white ≈ whiteBright,
  \$muted doesn't visually recede — UX bug documented in km session 2026-04-17.
- With contrast data, UI libraries can warn "your theme renders \$muted same
  as \$fg; consider switching to \$disabledfg or adding dimColor" — or even
  auto-swap tokens at runtime via a capability query.

## Acceptance

(a) New probe captures standard + bright RGB for at least white/whiteBright
    and black/blackBright pairs.
(b) Results surfaced in content/probes-apps/*.json alongside existing booleans.
(c) UI (terminfo.dev site) shows a contrast badge per terminal.
(d) Existing probe result files regenerate without breakage.

