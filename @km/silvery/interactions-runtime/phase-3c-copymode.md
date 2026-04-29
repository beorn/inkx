---
id: "@km/silvery/interactions-runtime/phase-3c-copymode"
aliases:
  - km-silvery.interactions-runtime.phase-3c-copymode
  - km-silvery-interactions-runtime-phase-3c-copymode
created_by: Bjørn Stabell
created_at: 2026-04-06T07:07:12Z
closed_at: 2026-04-06T08:52:24Z
close_reason: CopyModeFeature (181 lines), withFocus extended with Esc+v chord +
  key dispatch at priority 200, COPY_MODE_CAPABILITY. Tests written. Silvery
  commit f5bac11.
---

# [x] Phase 3c: Extend withFocus for keyboard copy-mode (Esc+v) @km/silvery #task #P1

Extend withFocus with vim-style keyboard copy-mode. Uses SelectionFeature from Phase 3 (hard dependency — fails loudly if missing). Uses input-router for keyboard priority. Lives in ag-term/src/features/.

## Scope

Extend withFocus() to:
1. Create CopyModeFeature via createCopyModeFeature() (new: features/copy-mode.ts)
2. Intercept Esc+v via input-router at priority 200
3. h/j/k/l/v/V/y keybindings when active
4. Drive selection via SelectionFeature.setRange (hard dep)
5. Expose CopyModeFeature service

## Files

CREATE:
- vendor/silvery/packages/ag-term/src/features/copy-mode.ts — CopyModeFeature
- vendor/silvery/tests/features/copy-mode.integration.test.ts — enter/exit + motions
- vendor/silvery/tests/features/copy-mode-selection-sync.integration.test.ts — yank syncs to selection
- vendor/silvery/tests/features/copy-mode-no-selection.integration.test.ts — loud failure when missing

UPDATE:
- vendor/silvery/packages/create/src/with-focus.ts (+~60 lines)
- vendor/silvery/packages/ag-term/src/features/index.ts — add copy-mode export

## Services

  interface CopyModeFeature {
    state: Observable<CopyModeState>
    enter(): void
    exit(): void
  }

## Delete

Nothing.

## New tests

3 integration tests.

## /complete criteria

- test -f vendor/silvery/packages/ag-term/src/features/copy-mode.ts
- grep -q 'copyMode\|copy-mode' vendor/silvery/packages/create/src/with-focus.ts
- test -f vendor/silvery/tests/features/copy-mode.integration.test.ts
- bun vitest run vendor/silvery/tests/features/copy-mode*.integration.test.ts → all pass
- bun vitest run vendor/silvery → full suite passes

## MANDATORY

Read docs/lessons/refactoring.md IN FULL before starting.