---
mentions:
  - deprecated
  - km
id: "@km/silvery/plateau-finishing"
aliases:
  - km-silvery.plateau-finishing
  - km-silvery-plateau-finishing
created_by: claude:c6244087
created_at: 2026-04-23T20:18:41Z
closed_at: 2026-04-23T20:40:03Z
close_reason: Closed
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.plateau-finishing
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T13:18:56Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Finishing touches: un-deprecate run({colorLevel}), drop @deprecated cruft, relocate types @km/silvery #task #P3

blocks:: [[@km/silvery]]

Post-session /big audit found silvery at ~90% plateau. Three categories remain:

## A. Revisit run() deprecations (user decision)

- run.tsx:206 `run({ caps })` @deprecated — structural reason (can't encode colorForced/colorProvenance). Keep deletion planned for 1.1. ✓
- run.tsx:230 `run({ colorLevel })` @deprecated — the reason was 'use profile route for consistency', but post-reversal the option name matches caps.colorLevel. It IS the aligned shorthand. Recommend: un-deprecate. Drop the @deprecated JSDoc + the one-time warning (run.tsx:592,625) + the `caps / colorLevel` mentions in module docstring + the `RunOptionsProfileBranch` JSDoc at lines 67-70, 581.

## B. Long-standing @deprecated sweep (each needs decision)

- packages/create/src/{tree-utils,focus-events,focus-manager}.ts — `@deprecated Import from '@silvery/ag/...' instead`. Cross-package migration leftovers. Decide: delete vs keep for a major-version window.
- packages/commands/src/keys.ts — same shape.
- packages/ag-term/src/clipboard.ts:226,240 — `Use createOsc52Backend() for new code` — two old factories.
- packages/ag-term/src/selection-renderer.ts:147 — `Use composeSelectionCells + applySelectionToBuffer`.
- packages/ag-term/src/pipeline/output-verify.ts:319 — `Use SILVERY_STRICT_TERMINAL=vt100`.
- packages/ag-react/src/hooks/useCursor.ts:255 — `Use CursorAccessors from createCursorStore()`.
- packages/ink/src/ink-hooks.ts:42 — Ink-compat useFocus, keep (Ink compat is scoped).
- packages/ag/src/types.ts:214,224 — `dim` + `bold` Ink-compat props. Keep (Ink compat).

## C. Type file-location polish

- `TerminalCaps` + `TerminalEmulator` both live in `packages/ansi/src/detection.ts`. The file name is historically accurate (narrow-scope probes) but readers looking for `TerminalEmulator` expect it in `emulator.ts` or similar. Options: (1) rename `detection.ts` → `terminal-caps.ts` (its real content), (2) split into `caps.ts` + `emulator.ts`. Recommend (2) for clearest file:export mapping.

## D. Minor dead aliases (safe deletes)

- packages/ansi/src/theme/derived.ts:98-99 — `type DeriveFieldsAnsi16Input = DeriveFieldsInput`, `type DeriveFieldsTruecolorInput = DeriveFieldsInput` — identical aliases.
- packages/ag-term/src/pipeline/backdrop/plan.ts:251 — `type Plan = TerminalPlan` — verify consumers, then drop.

## Acceptance

- After A+B+C: grep '@deprecated' silvery → only Ink-compat (ink-hooks, ag/types dim/bold props)
- After C: `rg 'export (interface|type) Terminal(Caps|Emulator)' vendor/silvery/packages/ansi/src` → one home per type
- After D: grep for the alias names → 0 hits outside their own files

