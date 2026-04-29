---
id: "@km/silvery/interactions-runtime/phase-5"
aliases:
  - km-silvery.interactions-runtime.phase-5
  - km-silvery-interactions-runtime-phase-5
created_by: Bjørn Stabell
created_at: 2026-04-06T07:04:08Z
closed_at: 2026-04-06T09:29:54Z
close_reason: Deleted 6 old hooks (useTerminalSelection, usePointerState,
  useFind, useFindProvider, useCopyMode, useCopyProvider) — 1182 lines removed.
  Renamed semantic-copy.ts → copy-extraction.ts. All imports updated. Silvery
  commit 6e45465.
---

# [x] Phase 5: Purge old selection/find/copy-mode/drag hooks (scope-limited) @km/silvery #task #P1

Delete the old hook/provider API for selection, find, copy-mode, drag. Rename (not delete) semantic-copy.ts → copy-extraction.ts to keep the extraction pipeline. EXCLUDES paste/clipboard cleanup (deferred per Pro review).

## Scope

### Deletions (8 files)

From vendor/silvery/packages/ag-react/src/hooks/:
- useTerminalSelection.tsx → replaced by useSelection (Phase 3.1)
- usePointerState.tsx → replaced by useDragState (Phase 4)
- useCopyMode.tsx (old handler-returning version) → replaced by useCopyModeState (Phase 4)
- useCopyProvider.tsx → replaced by onCopy Box prop + capability lookup
- useFindProvider.tsx → replaced by onFind Box prop + capability lookup
- useFind.tsx (old version) → replaced by useFindState (Phase 4)

Components removed from exports:
- TerminalSelectionProvider
- CopyProvider
- FindProviderComponent

Types removed:
- UseTerminalSelectionResult
- UseFindResult
- UseCopyModeResult

### Rename (not delete)

vendor/silvery/packages/ag-term/src/semantic-copy.ts → vendor/silvery/packages/ag-term/src/copy-extraction.ts

Per Pro review 2 item 7, keep the pure extraction/transformation logic that turns a selection range + rendered content into copied text/payload. Delete only the SemanticCopyProvider wrapper abstraction.

After rename, the file should contain ONLY:
- Pure extraction functions (turn range + buffer → text, handling wide chars, wrapped lines, etc.)
- Maybe onCopy prop interface for apps that want to enrich plain text into markdown/html

Consumers of copy-extraction:
- SelectionFeature (Phase 3) — mouseup copy path
- onCopy Box prop path — nearest-ancestor lookup
- Future: copy-mode yank path (Phase 3c)

### What does NOT get deleted (deferred to follow-up per Pro review item 6)

- usePaste.tsx — paste architecture is a separate concern
- usePasteEvents.ts
- PasteProvider + PasteHandler type
- PasteEvent type
- clipboard.ts: createOsc52Backend (now used by clipboard capability in Phase 3)
- Other clipboard factories: evaluate at Phase 5 time — if unused, delete; if still used, keep
- ClipboardBackend interface: evaluate at Phase 5 time

Create follow-up bead before closing: @km/silvery/clipboard-paste-cleanup

## Delete strategy

Per refactoring lessons Case Study 1: delete OldWay, let tsc errors guide fixes, no @deprecated, no shims, no fallbacks.

Order:
1. useTerminalSelection.tsx
2. usePointerState.tsx
3. useCopyMode.tsx
4. useCopyProvider.tsx + CopyProvider component
5. useFindProvider.tsx + FindProviderComponent
6. useFind.tsx (old)
7. TerminalSelectionProvider
8. Remove all deleted names from exports.ts, hooks/index.ts, index.ts barrels
9. Rename semantic-copy.ts → copy-extraction.ts, trim to pure extraction functions only
10. Remove SemanticCopyProvider type and related exports

After each deletion, run tsc, fix all errors, commit. Keep tree always green.

## Delete

Listed above: 6 hooks + 3 components + 3 types + semantic-copy wrapper abstraction.

Rename (not delete): semantic-copy.ts → copy-extraction.ts

## New tests

None new. Regression gate is that existing + Phase 3-4 tests still pass.

## Definition of Done

- [ ] 6 hook files deleted
- [ ] 3 components removed from exports
- [ ] 3 types removed from exports
- [ ] semantic-copy.ts renamed to copy-extraction.ts
- [ ] copy-extraction.ts contains only pure extraction logic (no Provider wrapper)
- [ ] Barrel exports updated (remove deleted, add renamed)
- [ ] Follow-up bead created: @km/silvery/clipboard-paste-cleanup
- [ ] tsc 0 new errors
- [ ] All tests pass
- [ ] Paste code UNTOUCHED (no accidental deletions)

## /complete criteria (run literally, ALL must pass)

Source code:
- grep -rn 'useTerminalSelection' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits
- grep -rn 'usePointerState' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits
- grep -rn 'useCopyProvider' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits
- grep -rn 'useFindProvider\|FindProviderComponent' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits
- grep -rn 'TerminalSelectionProvider' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits
- grep -rn 'CopyProvider\b' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits
- grep -rn 'SemanticCopyProvider' vendor/silvery --include='*.ts' --include='*.tsx' → 0 hits

Renamed file:
- test -f vendor/silvery/packages/ag-term/src/copy-extraction.ts
- test ! -e vendor/silvery/packages/ag-term/src/semantic-copy.ts

Paste code untouched:
- grep -q 'usePaste' vendor/silvery/packages/ag-react/src/hooks/usePaste.tsx → SHOULD exist (intentionally kept)
- test -f vendor/silvery/packages/ag-term/src/bracketed-paste.ts

Exports cleanup:
- grep 'useTerminalSelection\|usePointerState\|useCopyProvider\|useFindProvider\|TerminalSelectionProvider\|CopyProvider\|FindProviderComponent\|SemanticCopyProvider' vendor/silvery/packages/ag-react/src/exports.ts → 0 hits
- grep 'useTerminalSelection\|usePointerState\|useCopyProvider' vendor/silvery/packages/ag-react/src/hooks/index.ts → 0 hits

Follow-up bead:
- bd list | grep 'clipboard-paste-cleanup' → found

Tests:
- bun vitest run vendor/silvery → all pass
- cd vendor/silvery && npx tsc --noEmit → 0 new errors

## MANDATORY

Read docs/lessons/refactoring.md IN FULL before starting.