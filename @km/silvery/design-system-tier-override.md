---
id: "@km/silvery/design-system-tier-override"
aliases:
  - km-silvery.design-system-tier-override
  - km-silvery-design-system-tier-override
created_by: Bjørn Stabell
created_at: 2026-04-18T03:52:24Z
closed_at: 2026-04-18T05:43:04Z
close_reason: Merged into km-silvery.scheme-detect (unified detection bead)
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.design-system-tier-override
    depends_on_id: km-silvery.design-system
    type: parent-child
    created_at: 2026-04-17T20:52:23Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] SILVERY_COLOR env var — force color tier for dev/test/screenshots @km/silvery #feature #P3

blocks:: [[@km/silvery/design-system]]

## Why

Developers and CI need to render silvery apps at each capability tier independent of the terminal's actual capabilities. Use cases:

- **Dev iteration**: verify each tier looks intentional while working in iTerm2 (truecolor)
- **Screenshots**: capture all 4 tier variants for docs and marketing
- **Regression tests**: snapshot golden outputs per tier; catch silent ANSI16/mono regressions
- **CI matrix**: fast tests in truecolor (default), slow tests run ×4 across tiers

## Spec

New env var `SILVERY_COLOR`:

| Value | Effect |
|---|---|
| `truecolor` / `24bit` | Force 24-bit ANSI emission |
| `256` | Force 256-color quantization (cube + ramp) |
| `ansi16` / `16` | Force slot rendering (user's theme at ANSI16) |
| `mono` / `1` | Force attrs-only (bold/dim/inverse) |
| `auto` (default) | Run detection (existing behavior) |

CLI flag equivalent: `--color-tier=<value>` where supported (km, examples, tests).

## Precedence

1. `--color-tier=X` CLI flag
2. `SILVERY_COLOR=X` env var
3. `NO_COLOR=*` → mono
4. `FORCE_COLOR` → enables but doesn't specify tier (goes through detection)
5. Auto-detection (existing: NO_COLOR → TERM=dumb → !isatty → COLORTERM → TERM → fallback ANSI16)

## Implementation notes

- Lives in `@silvery/ansi` capability detection module (single source of truth)
- Exposed to `@silvery/design/bindings/term` so token resolution knows which field to emit
- Termless test harness reads it to snapshot per-tier goldens

## Acceptance criteria

- [ ] `SILVERY_COLOR=ansi16 bun km view <path>` renders all tokens via slot field
- [ ] `SILVERY_COLOR=mono ...` emits only attrs, no color codes
- [ ] `SILVERY_COLOR=256 ...` emits 256-cube indices, not 24-bit
- [ ] Snapshot tests cover all 4 tiers for a canonical showcase app
- [ ] Documented in docs/ref/terminal-color-strategy.md

## Related

- Parent: @km/silvery/design-system
- Reference: docs/ref/terminal-color-strategy.md
- Complements: ansi-color-detection.md (on/off decision)
