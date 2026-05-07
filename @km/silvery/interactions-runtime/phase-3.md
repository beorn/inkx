---
mentions:
  - km
id: "@km/silvery/interactions-runtime/phase-3"
aliases:
  - km-silvery.interactions-runtime.phase-3
  - km-silvery-interactions-runtime-phase-3
created_by: Bjørn Stabell
created_at: 2026-04-06T07:03:18Z
closed_at: 2026-04-06T08:37:29Z
close_reason: SelectionFeature (180 lines), ClipboardCapability (OSC 52),
  capability symbols, withDomEvents extended with selection+invalidation,
  withTerminal extended with clipboard. 36 new tests pass. Silvery commit
  4c5f03a.
owner: bjorn@stabell.org
---

# [x] Phase 3: SelectionFeature + withDomEvents selection integration (architecture validation) @km/silvery #task #P1

Make text selection actually work. Create SelectionFeature service, register it as a capability, extend withDomEvents to drive it from mouse events. The input router + invalidation + capability registry already exist from Phase 2.5.

## Key decisions (from Pro review 2)

### Selection is always installed with withDomEvents (no 'selection: true' toggle)

Per Pro review 2 item 1: earlier drafts added 'withDomEvents({ selection: { ... } })' which contradicts 'no new public options.' Instead, selection is part of what withDomEvents does.

Behavior:

- withDomEvents always creates the selection feature internally
- Selection is active whenever userSelect prop allows it
- No opt-in toggle — matches 'zero km code changes' goal

### Copy default is capability-based (no copyOnSelect: false contradiction)

Per Pro review 2 item 2: 'copyOnSelect: false' + 'km works with zero code changes' are mutually exclusive.

Resolution:

- selection mouseup looks up a clipboard capability (symbol-keyed via capability registry from Phase 2.5)
- If capability present: call its copy() method with the selected text
- If capability absent: no-op (selection persists, user can still copy via explicit command)

withDomEvents registers an OSC 52 clipboard capability by default when run in a Term (terminal has clipboard sink). Apps running headless don't get one. km already uses Term → automatically gets OSC 52 copy without any config.

Result:

- km: selection highlights + copy on mouseup (zero code changes)
- headless tests: selection highlights but no copy (no Term = no clipboard capability)
- Neither path requires user config

### Service API is minimal

Per Pro review 2 item 11D: drop extend() from the public interface. Keep only state + setRange + clear. If cross-feature code later needs extend, add it then.

interface SelectionFeature {
    state: Observable<TerminalSelectionState>
    setRange(range: SelectionRange | null, source?: string): void
    clear(): void
  }

### Services are internal capabilities, not public app fields

Per Pro review 2 item 11C: use symbol-keyed capabilities via the registry from Phase 2.5. Don't expose app.selection directly.

Internally: router.registerCapability(SELECTION_CAPABILITY, selectionFeature)
Observer hook reads: router.getCapability(SELECTION_CAPABILITY)

Public app shape stays clean.

## Scope

1. Create features/selection.ts in ag-term (or wherever placements land after Pro review discussion)

NOTE: Phase 2.5 moved input-router to @silvery/create. Does SelectionFeature also belong in create?

Arguments for create: with-dom-events (its consumer) lives there; it is runtime composition, not terminal rendering.
  Arguments for ag-term: it uses TerminalBuffer for overlay rendering (via selection-renderer.ts).

Decision: keep SelectionFeature in ag-term, in a new features/ subfolder. Rationale: the feature wraps backend-specific behavior (buffer extraction, overlay rendering). ag-canvas would have its own features/selection.ts. This preserves multi-backend architecture.
2. Extend withDomEvents (in @silvery/create):

- Create SelectionFeature instance
- Register as capability via router from Phase 2.5
- Extend processMouseEvent: mousedown runs selectionHitTest + finds contain scope; mousemove while dragging extends machine; mouseup finalizes and calls clipboard capability if present
- Alt+drag override
- Selection state changes call router.invalidate() to trigger render
8. Register selection overlay renderer with router (priority 100) so output phase repaints the overlay.
9. OSC 52 clipboard capability is registered by withTerminal (not withDomEvents — withTerminal is backend-specific). The clipboard capability exposes a copy(text) method. withDomEvents looks it up via router on mouseup.
10. 7 integration tests including the critical invalidation test.

## Files

CREATE:

- vendor/silvery/packages/ag-term/src/features/index.ts — barrel
- vendor/silvery/packages/ag-term/src/features/selection.ts — SelectionFeature
- vendor/silvery/packages/ag-term/src/features/clipboard-capability.ts — OSC 52 clipboard capability registration
- vendor/silvery/tests/features/selection.integration.test.ts — mouse drag selects
- vendor/silvery/tests/features/selection-contain.integration.test.ts — contain boundary
- vendor/silvery/tests/features/selection-copy.integration.test.ts — copy on mouseup when capability present
- vendor/silvery/tests/features/selection-no-copy.integration.test.ts — no copy when capability absent
- vendor/silvery/tests/features/selection-alt-drag.integration.test.ts — Alt override
- vendor/silvery/tests/features/selection-invalidation.integration.test.ts — CRITICAL: selection state change triggers render WITHOUT app state change
- vendor/silvery/tests/features/selection-reverse-drag.integration.test.ts — backwards drag works

UPDATE:

- vendor/silvery/packages/create/src/with-dom-events.ts — create + register SelectionFeature, extend processMouseEvent, call invalidate on state changes
- vendor/silvery/packages/create/src/with-terminal.ts — register OSC 52 clipboard capability via router
- vendor/silvery/packages/ag-term/src/pipeline/output-phase.ts — read selection state from capability, apply overlay via selection-renderer (priority 100)
- vendor/silvery/packages/ag-term/src/index.ts — export features/ barrel

## Symbol keys

Define in a shared location (Phase 2.5 capability-registry.ts or a new symbols.ts):

export const SELECTION_CAPABILITY = Symbol('silvery.selection')
  export const CLIPBOARD_CAPABILITY = Symbol('silvery.clipboard')
  export const FIND_CAPABILITY = Symbol('silvery.find')  // used in Phase 3b
  export const COPY_MODE_CAPABILITY = Symbol('silvery.copy-mode')  // used in Phase 3c
  export const DRAG_CAPABILITY = Symbol('silvery.drag')  // used in Phase 3d

## Delete

Nothing.

## New tests (7)

1. **selection.integration.test.ts** — mouse drag → selection state has range
2. **selection-contain.integration.test.ts** — userSelect='contain' clamps range to container bounds
3. **selection-copy.integration.test.ts** — with clipboard capability registered, mouseup triggers copy(text)
4. **selection-no-copy.integration.test.ts** — without clipboard capability, mouseup does not throw, selection persists
5. **selection-alt-drag.integration.test.ts** — Alt+drag bypasses userSelect='none'
6. **selection-invalidation.integration.test.ts** — CRITICAL: drag mouse, assert output pass triggered without any React/store state change. This is the test that catches the redraw invalidation risk from Pro review 2 item 11A.
7. **selection-reverse-drag.integration.test.ts** — drag right-to-left produces same selection as left-to-right

## Definition of Done

- [ ] features/selection.ts exists with minimal SelectionFeature (state/setRange/clear)
- [ ] withDomEvents creates + registers selection feature as SELECTION_CAPABILITY
- [ ] withTerminal registers OSC 52 as CLIPBOARD_CAPABILITY
- [ ] Selection state changes call router.invalidate()
- [ ] Output phase applies selection overlay
- [ ] 7 integration tests pass
- [ ] Behavior: selection starts, extends, finalizes correctly
- [ ] Behavior: overlay repaints on state change (not tied to React/store state)
- [ ] Behavior: copy fires when clipboard capability present
- [ ] Behavior: copy does NOT fire when clipboard capability absent
- [ ] Behavior: Alt+drag overrides userSelect='none'

## /complete criteria

- test -f vendor/silvery/packages/ag-term/src/features/selection.ts
- test -f vendor/silvery/packages/ag-term/src/features/clipboard-capability.ts
- test -f vendor/silvery/packages/ag-term/src/features/index.ts
- grep -q 'SELECTION_CAPABILITY' vendor/silvery/packages/create/src/with-dom-events.ts
- grep -q 'CLIPBOARD_CAPABILITY' vendor/silvery/packages/create/src/with-terminal.ts
- grep -q 'invalidate' vendor/silvery/packages/create/src/with-dom-events.ts
- test -f vendor/silvery/tests/features/selection.integration.test.ts
- test -f vendor/silvery/tests/features/selection-contain.integration.test.ts
- test -f vendor/silvery/tests/features/selection-copy.integration.test.ts
- test -f vendor/silvery/tests/features/selection-no-copy.integration.test.ts
- test -f vendor/silvery/tests/features/selection-alt-drag.integration.test.ts
- test -f vendor/silvery/tests/features/selection-invalidation.integration.test.ts
- test -f vendor/silvery/tests/features/selection-reverse-drag.integration.test.ts
- bun vitest run vendor/silvery/tests/features/selection*.integration.test.ts → all pass
- bun vitest run vendor/silvery → full suite passes

## Notes on what is NOT in this phase

- useSelection hook → Phase 3.1 (immediately after this)
- Dev-mode warnings → moved to Phase 6 per Pro review 2 recommendation (detection plumbing is complex, non-blocking)
- find/copy-mode/drag feature integration → Phase 3b/3c/3d (independent, no longer chained)
- Demo rewrite → Phase 3.1

## MANDATORY

Read docs/lessons/refactoring.md IN FULL before starting.

