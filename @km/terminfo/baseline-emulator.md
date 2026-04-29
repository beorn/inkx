---
id: "@km/terminfo/baseline-emulator"
aliases:
  - km-terminfo.baseline-emulator
  - km-terminfo-baseline-emulator
created_by: claude:4929065a
created_at: 2026-03-26T08:09:29Z
closed_at: 2026-03-31T21:09:58Z
close_reason: "Decision made: @vterm/vt100 (baseline) + @vterm/modern (full).
  Design principle documented in memory/vt100-vterm-roles.md. Actual rename
  deferred to release cycle."
---

# [x] Baseline emulator naming: vt100.js is really VT220-era, consider rename or new package @km/terminfo #task #P3

Architecture decision: vterm.js becomes the ONE configurable emulator with feature-flag profiles. vt100.js and vt220.js become thin preset wrappers.

## Decision (2026-03-31)

vterm.js = single engine with configurable terminal profiles.
vt100.js, vt220.js = pre-configured profiles, published as bare npm packages.

## Package Structure

| Package | npm name | What |
|---------|----------|------|
| @vterm/core | @vterm/core | Shared engine: parser, state machine, profiles |
| @vterm/modern | vterm.js | Full modern emulator (default profile) |
| @vterm/vt100 | vt100.js | VT100 profile preset |
| @vterm/vt220 | vt220.js (new) | VT220 profile preset |

Bare packages (vterm.js, vt100.js, vt220.js) are thin re-exports of @vterm/* scoped packages.
Additional profiles can live in @vterm/ scope without bare package equivalents.

## Profile Architecture

createVterm({ profile: 'vt100' })  // restricted feature set
createVterm({ profile: 'vt220' })  // more features  
createVterm({ profile: 'xterm-256color' })
createVterm()                       // full modern (default)

Profiles are feature flag presets. Users can override individual features:
createVterm({ profile: 'vt220', trueColor: true })  // vt220 + truecolor

## Key Design Questions
1. Parser-level vs behavior-level config: some features change CSI parsing (Kitty KB protocol). Need configurable parser or feature-gated parse paths.
2. Feature flag granularity: per-escape-sequence or per-capability-group?
3. terminfo.dev integration: profiles map to terminfo capability sets for conformance testing.