---
mentions:
  - km
  - claude
id: "@km/silvery/sgr-compat"
aliases:
  - km-silvery.sgr-compat
  - km-silvery-sgr-compat
created_by: claude:474834b0
created_at: 2026-03-10T07:08:37Z
closed_at: 2026-03-10T08:31:19Z
close_reason: "Silvery now emits chalk-compatible ANSI natively: 4-bit codes
  (30-37,40-47), per-attribute resets (39,49,22,23,24), individual SGR
  sequences. Eliminated ~200-line post-processing conversion layer in compat."
owner: bjorn@stabell.org
assignee: claude:474834b0
---

# [x] Differential SGR output: multi-color-mode + per-attribute resets for automatic chalk compat @km/silvery #task #P2 @claude:474834b0

## What

Change silvery's output phase to emit chalk-compatible ANSI by default:

1. **Per-attribute SGR resets** instead of full `\x1b[0m` reset-and-reapply. When moving between cells, emit only the delta (set new attributes, unset old ones with their specific reset codes).
2. **Multi-color-mode output**: Use 16-color SGR codes (`\x1b[32m`) for basic colors 0-7, 256-color (`38;5;N`) for extended palette, truecolor (`38;2;R;G;B`) for RGB. Currently silvery always uses 256-color even for basic colors.

## Why

- Eliminates the 200+ line `toChalkCompat` / `silveryToChalkAnsi` conversion in the compat layer
- Makes silvery output natively readable by chalk-based tooling
- Shorter escape sequences (fewer bytes per frame)
- The current reset-and-reapply approach was the simplest thing that worked, not a deliberate design choice

## Where

`packages/term/src/pipeline/output-phase.ts` — the buffer diff loop that emits ANSI sequences.

## Acceptance criteria

- [ ] Basic colors 0-7 use 16-color SGR (`30-37` fg, `40-47` bg)
- [ ] Extended colors 8-255 use 256-color SGR (`38;5;N`)
- [ ] RGB colors use truecolor SGR (`38;2;R;G;B`)
- [ ] Attribute changes emit per-attribute set/unset (not full reset)
- [ ] `toChalkCompat` removed from compat layer
- [ ] All existing tests pass (output format changes are transparent)
- [ ] Compat tests that were checking chalk output pass without conversion

