---
mentions:
  - km
  - Bjørn
id: "@km/silvery/input-event-model"
aliases:
  - km-silvery.input-event-model
  - km-silvery-input-event-model
created_by: Bjørn Stabell
created_at: 2026-04-09T04:12:42Z
closed_at: 2026-04-10T23:05:20Z
close_reason: "Levels 1-2 complete (release filtering, type unification, shared
  isModifierOnlyEvent). Remaining scope split into dedicated beads:
  km-silvery.event-precedence (3-lane model), km-silvery.paste-unification
  (unified hook), km-silvery.ag-test-coverage (hook tests), km-silvery.doc-drift
  (6 contradictions)."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Input event model: filter release events from useInput, add semantic input layer @km/silvery #feature #P0 @Bjørn Stabell

## Input Event Model Quality Plateau

### Status (2026-04-10)

Level 1 DONE: useInput release filtering fixed (@km/silvery/double-keypress).
Zero-hooks-run DONE: all hooks unified in ag-react (@km/silvery/zero-hooks-run).

### Remaining Quality Gaps (blocking plateau)

1. **InputHandler type mismatch** — render.tsx:236 and InputBoundary.tsx:62 define InputHandler WITHOUT 'exit' return. Canonical type in @silvery/ag/keys.ts:107 HAS it. Fix: import from ag, delete local defs.
2. **PasteHandler name collision** — usePaste.tsx:38 (interface with onPaste method) vs render.tsx:237 and InputBoundary.tsx:63 (callback function). Same name, different types. Fix: rename callback versions to PasteCallback.
3. **Modifier-only filtering duplicated** — isModifierOnlyEvent() in useInput.ts:21-42 AND inline expansion in create-app.tsx:2335-2352. Fix: export from ag/keys.ts, use everywhere.
4. **Test gaps** — usePaste, usePasteEvents, useExit, useInputLayer have zero dedicated tests.
5. **Docs** — onRelease, useInputLayer, dispatchKeyEvent behavior undocumented in guides.

### Levels (from original bead)

- [x] Level 1: GUARD — filter release in useInput (DONE)
- [ ] Level 2: REDESIGN — unify types, eliminate naming collisions, shared filtering
- [ ] Level 3: SPEC — semantic input layer, hook hierarchy doc
- [ ] Level 4: ARCHITECTURE — input-architecture.md covers full event model

/complete: zero type collisions, zero filter duplication, all hooks tested, architecture doc complete

