---
id: "@km/silvery/usecursor-race"
aliases:
  - km-silvery.usecursor-race
  - km-silvery-usecursor-race
created_by: claude:0940ca20
created_at: 2026-04-24T22:50:19Z
---

# [ ] useCursor race: multiple sibling TextInputs with mixed isActive stomp cursor state (last-writer-wins) @km/silvery #bug #P2

## Symptom

Rendering N silvery TextInputs as siblings, only ONE with `isActive={true}`, no cursor renders anywhere. Root cause: silvery's `useCursor` hook at `vendor/silvery/packages/ag-react/src/hooks/useCursor.ts:234-247` runs its effect on every mount; inactive instances CLEAR the cursor state (`visible: false`) and stomp the active one's set (`visible: true`) via last-writer-wins effect ordering.

## Repro

Mount three `<TextInput>` components in a column with `isActive={i === 0}` on only the first. Expected: cursor on entry 0. Actual: no cursor visible anywhere.

## Current silvercode workaround

`apps/silvercode/src/components/CommandBox.tsx` QueueEditor renders only the active entry as TextInput; inactive entries render as plain `<Text>`. Sidesteps the race because only one `useCursor` ever runs. Commit: `6be6ef66e`.

## Canonical fix direction

useCursor should use a shared registry (not per-instance state) — each active instance registers, the last active one wins. Inactive instances shouldn't clear the registry. Alternatives:
- Effect dependency on `visible` — only fire on visible=true; leave cleanup to unmount
- Shared cursor-owner signal — all instances subscribe; writes go to a per-frame reducer that picks the unique active instance

## Acceptance

- N sibling TextInputs with one active → cursor visible on the active one, regardless of mount order
- Silvery test in `tests/features/` covering the multi-instance scenario
- Remove the silvercode workaround; render all queue entries as TextInput again (they can all be 'live' for editing; only active has hardware cursor)

## Parent

Standalone silvery bug (no epic). Relates to `km-silvercode.wrap-ergonomic` only tangentially (both are silvery ergonomics).