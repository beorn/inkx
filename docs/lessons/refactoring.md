# Refactoring Lessons

**TL;DR**: Delete old code first, fix breaks second. Backwards compatibility is a trap.

Hard-won lessons from big refactoring projects. Follow these to avoid common traps.

---

## Case Study 1: Domain Objects Migration

**Bead**: km-domain epic

**Problem**: Singleton pattern (`getDb()`, `loadRepo()`) blocked testing and prevented dependency injection.

**Wrong approach**: Added "singleton wrappers for backwards compatibility" to allow old code to continue working while migration progressed.

**Result**: With fallbacks available, old patterns persisted. Multiple commits patched symptoms instead of removing the root cause. The migration never completed.

**Fix**: Deleted singletons completely. Used `tsc` errors to find all callers. Fixed every call site in one session.

---

## Case Study 2: Silvery/ansi Absorption

**Bead**: km-term-2 epic

**Problem**: `@beorn/tui` depended on Silvery, causing module resolution issues.

**Wrong approach**: Re-exported Silvery components from tui ("for convenience").

**Result**: Confusing import paths, bundle issues, unclear boundaries between packages.

**Fix**: Made tui standalone with explicit boundaries. No re-exports.

---

## Case Study 3: NewWay Documentation Drift

**Bead**: Multiple km-term beads marked "completed"

**Problem**: NewWay patterns existed in code, but documentation, examples, and README files still showed OldWay patterns.

**What was found** (after beads marked complete):

- README showed `render(<App />)` instead of `render(term, <App />)`
- 8 example files still used OldWay patterns
- docs/site API reference showed old signatures
- Hook names `useLayout` instead of `useBoxRect`
- Function overloads still accepted OldWay calls

**Why this happens**:

1. **Bead scope too narrow** - "migrate render() to NewWay" was completed for the actual `render.tsx` file, but didn't include examples, docs, README
2. **Overloads enable procrastination** - Adding NewWay as an overload means OldWay still works, so "migration" is technically complete
3. **Docs not treated as code** - Migration checklist didn't include documentation files

**How to prevent**:

1. **Include docs in migration scope** - When a bead says "migrate X", it means ALL references: code, examples, README, docs/site
2. **Remove OldWay overloads immediately** - Don't support both signatures. Force callers to update.
3. **Search for pattern usage** - `grep -r "render(<" examples/` would have found all OldWay examples
4. **Definition of Done includes docs** - Migration isn't complete until:
   - Code uses NewWay
   - Tests use NewWay
   - Examples use NewWay
   - README uses NewWay
   - API docs use NewWay

**The fix**: Remove OldWay overloads entirely, add default `term` export for convenience, update all documentation in one pass.

---

## Core Lessons

### 1. Update Beads First

**Problem**: Non-rebased beads cause implementers to accidentally revert NewWay back to OldWay.

**Why it happens**:

- Agent starts working from outdated bead context
- Bead references old patterns, old file locations, old APIs
- Agent follows bead instructions, unknowingly reverting progress

**What "rebase" means**: Update bead descriptions to reflect current codebase state before starting work. This isn't git rebase - it's updating the issue text so it describes reality.

**Solution**: Before starting any refactoring work:

```bash
bd list --status open   # Find related beads
# Update each bead's description to reflect current state
bd update <id> --description "Updated: now uses NewWay pattern..."
```

### 2. Break Intentionally

**Problem**: Half-migrated code persists forever when both OldWay and NewWay work.

**Why it happens**:

- Backwards compat means nothing forces completion
- "I'll finish migrating later" never happens
- LLMs copy whichever pattern they see first

**Solution**: When absorbing/migrating:

- Remove or break OldWay immediately after creating NewWay
- Let `tsc` and tests guide you to all call sites
- Fix all breaks in one session

```typescript
// GOOD: Delete old export, fix all imports immediately
// export { oldThing }  // DELETE THIS

// BAD: Keep both working "temporarily"
export { oldThing } // "deprecated"
export { newThing } // "use this instead"
```

### 3. Purge Aggressively

**Problem**: Deprecation leaves confusing dual paths that never get cleaned up.

**Why it happens**:

- Deprecated code still works, so there's no urgency
- "Soft migration" creates ambiguity about which path to use
- LLMs can't read `@deprecated` JSDoc comments

**Solution**: Delete deprecated APIs immediately.

- Comment out with stern warnings (see [Quarantine and Delete](../principles.md#principle-quarantine-and-delete))
- No `@deprecated` annotations - they don't work
- No "will be removed in v2" - remove it now

### 4. No Backwards Compatibility Hacks

**Problem**: Shims and re-exports for backwards compat prevent migration from ever completing.

**Examples of traps**:

```typescript
// BAD: Re-export for "backwards compat"
export { newFunction as oldFunction }

// BAD: Fallback pattern
const result = newWay() ?? oldWay()

// BAD: Adapter layer
function oldApi(args) {
  return newApi(transformArgs(args))
}
```

**Solution**: No shims. No re-exports. No fallbacks. Fix all callers immediately.

### 5. Phase Order Matters

**Problem**: Fixing code before removing old patterns leads to wasted effort and incomplete migrations.

**Wrong order**: Fix -> Remove (fixes code that shouldn't exist)

**Right order**:

1. **Update** - Update beads and documentation to reflect NewWay
2. **Absorb** - Move functionality to new location/API
3. **Purge** - Delete old APIs (break the build intentionally)
4. **Remove** - Delete old files, exports, re-exports
5. **Fix** - Now fix all the breaks (guided by `tsc`)

---

## Case Study 4: Complexity Score Reduction

**Bead**: km-rev-0203.2

**Problem**: 132 functions flagged by oxlint cognitive complexity rule. Needed systematic reduction.

**Wrong approach**: Refactor every function blindly to get below threshold.

**Right approach**: Triage-first. Not all functions need refactoring.

**Triage results** (33 functions scored 25-64):
- 9 functions refactored below 30 using extract-method patterns
- 24 functions suppressed with `oxlint-disable` comments + reason
- 0 functions needed no action (already below threshold)

**Key insight**: Exhaustive `switch` statements validated by TypeScript should NOT be converted to lookup objects — the lookup loses compile-time completeness checking. React components with many JSX conditionals inflate scores but are structurally readable. Test helpers don't need low complexity.

**Patterns that worked**:

| Pattern | Score reduction | Example |
|---------|----------------|---------|
| Orchestrator + phase helpers | 64 → 28 | `listTasks` → resolveInput + renderTaskList |
| Strategy extraction | 47 → 18 | `resolveNode` → 5 strategy functions |
| Shared loop helper | 36 → 18 | `progressiveSelectAll` → `buildSelectAllSet(scope)` |
| DRY INSERT helper | 39 → 24 | `parseDeferredSequential` → shared `insertNodeRow` |

**Execution**: Two batches of parallel agents (5 + 4), parent-only verification. Total: 9 refactored functions, 24 suppressed, warnings reduced from ~64 to ~42.

**Lesson**: Spend 80% of effort on triage and categorization, 20% on actual refactoring. Most "high complexity" functions are fine with a suppress comment explaining why.

---

## Case Study 6: @silvery/style Extraction (bead drift)

**Bead**: km-silvery.style

**Problem**: A 6-phase bead with specific checklist items per phase. When systematically audited afterward, 8 gaps were found — items marked done in bead notes that weren't actually completed as specified.

**Root cause — "aspirational done"**: Phase items were marked complete based on "I did work related to Phase N" rather than "I verified every checklist item in Phase N." Example: bead said "Move createStyleProxy from ag-term to @silvery/style" but what actually happened was rewriting it in-place. Nobody ran the /complete criteria (`grep createStyleProxy in ag-term → 0`) before marking Phase 1 done.

**Root cause — unrecorded deviations**: When the implementer decided to keep chalk in ink/chalk.ts for backwards compatibility (instead of "delete chalk.ts wrapper"), that was a valid engineering decision. But the bead notes said "Phase 2 done" without noting the deviation. The bead now described a world that didn't exist.

**Root cause — no bead-vs-reality verification**: The /complete skill checks for remnants in the codebase but didn't systematically compare each bead checklist item against reality. The gap between "what the bead says happened" and "what actually shipped" grew silently across 6 phases.

**Lessons**:

1. **Bead checklist items must be verified with exact /complete criteria before marking done.** Not from memory — with grep/ls/read. "Move X from A to B" means: grep X in A (0 hits), grep X in B (>0 hits).

2. **When you deviate from the plan, update the bead immediately.** Kept chalk instead of deleting it? Rewrote instead of extracted? That's fine engineering — but update the bead description to match reality BEFORE marking the item done. Don't mark the original item as done when you did something different.

3. **"Phase N done" must mean "every checklist item verified", not "I did work related to Phase N."** If 4 of 5 items are done and 1 was skipped, mark the 4 as done, mark the 1 as "SKIPPED: reason", and note the deviation.

4. **Bead drift grows silently.** Each phase builds on the assumption that previous phases are accurate. By Phase 6, the bead may describe a completely different system than what exists. Nobody notices until a systematic audit.

---

## Case Study 7: @silvery/ansi 1.0 (copy without delete)

**Bead**: km-silvery.style (final phase — merge @silvery/style into @silvery/ansi)

**Problem**: Copied OSC query files from ag-term and theme types/derive from @silvery/theme into @silvery/ansi. The new copies worked and tests passed. But the old copies in ag-term and @silvery/theme remained as full local implementations — not re-exports. 5 dual-pattern issues found by /complete.

**Root cause — copy-then-forget**: The /refactor skill says "copy → delete from old → fix breaks → test" as ONE sequence. But the implementation treated "copy to new location" and "replace old with re-export" as separate steps. By the time /complete ran, the old copies were forgotten because nothing was broken.

**Root cause — no break = no urgency**: Unlike a deleted API (which produces tsc errors), a duplicated file causes zero errors. ag-term's barrel still exported from its local copy. ag-react re-exported from ag-term. Everything compiled. The duplication was invisible to tests and types.

**Root cause — move verification not part of the commit**: "Move X from A to B" should be verified atomically: (1) B exports X, (2) A re-exports from B (or is deleted). The implementation verified (1) but not (2).

**Lesson**: After any "move X from A to B" operation, in the SAME commit:
1. Verify B has X: `grep X in B` (>0)
2. Replace A's local copy with `export { X } from "B"` (re-export, not local code)
3. Run tests to verify the re-export chain works

If step 2 is deferred "for later," it will be forgotten. The old copy compiles, passes tests, and nobody notices until a manual audit.

---

## Quick Checklist

Before starting a big refactor:

- [ ] All related beads updated to current state?
- [ ] Plan to break OldWay immediately after NewWay works?
- [ ] No backwards compat shims planned?
- [ ] No function overloads supporting both old and new signatures?
- [ ] Phase order: Update -> Absorb -> Purge -> Remove -> Fix?

During refactor:

- [ ] OldWay is broken/deleted, not deprecated?
- [ ] `tsc` errors guide all remaining work?
- [ ] No "finish later" TODOs for migration?

Definition of Done (migration complete when ALL updated):

- [ ] Source code uses NewWay
- [ ] Tests use NewWay
- [ ] Examples use NewWay
- [ ] README uses NewWay
- [ ] API docs (docs/site) use NewWay
- [ ] `grep` finds no OldWay patterns
- [ ] New packages have tests (at least 1 test file per package)
- [ ] Docstrings/comments don't promise unimplemented APIs
- [ ] /complete criteria updated to match actual scope (not aspirational)

---

## Case Study: ColumnState/CardState Elimination (visual-nav-migration)

**Bead**: km-tui.visual-nav-migration → km-yedow

**Problem**: The visual-nav migration (4 phases, multiple sessions) added `cursorNodeId` but never deleted the old wrapper types (`ColumnState`, `CardState`, `ColumnsLayout`). 249 occurrences of `colIndex/cardIndex` across 27 files, 99 occurrences of `ColumnState/CardState` across 19 files.

**Why it survived**: Each session found "still has consumers" and deferred deletion to "the next phase." The wrappers were thin enough that nothing broke — they just created a parallel type system that confused every agent touching the code.

**Fix**: One session, 47 files, delete first / fix breaks second. Used `tsc` and `grep` as guides. Key insight: don't just rename types — also delete the functions that only existed because of the old types (`refreshBoardState`, `deriveCursorPosition`).

**Pitfall during migration**: Deleting `CardState` also removed pre-fetched `card.children`. The `buildNodeIndex` function relied on walking card children to map descendant nodeIds back to their parent card position. When children disappeared, cursor resolution after indent/outdent broke silently. Fix: add an optional `getChildren` callback to `buildNodeIndex` that fetches children from repo on demand.

**Lesson**: When removing a wrapper type, audit every property it provides. If a consumer used `wrapper.children`, you can't just delete it — you need to provide the equivalent access path (`repo.getChildren(id)`). Map every property to its replacement before starting.

**Anti-pattern that caused the delay**: "Phase N will handle deletion." No it won't. The session that creates new types must delete old types. If you ship a commit with both old and new types coexisting, the old types will survive indefinitely.

---

## Case Study 5: Era2 Package Extraction (silvery)

**Bead**: km-silvery.era2 epic (27 children, 13 closed in one session)

**Problem**: Silvery's monolithic `@silvery/tea` package (6,253 LOC, 29 files) needed decomposition into focused packages: `@silvery/headless`, `@silvery/commands`, `@silvery/scope`, `@silvery/signals`, `@silvery/model`.

**What went right**:
- Package rename (@silvery/tea → @silvery/create) was clean: `sed` replaced 70+ imports in one pass, zero source hits remaining
- New packages extracted with tests from day one (100 + 19 + 17 + 10 + 5 + 7 = 158 tests)
- Barrel cleanup was thorough: AppHandle, RenderAdapter, TermDef all removed from public exports

**What went wrong**:

1. **Docstrings promised unimplemented APIs**. `compose.ts` header listed `withTest()` as if it existed — LLMs and developers reading the file would assume it's available. *Fix*: Only document what's shipped. Future APIs belong in design docs, not source comments.

2. **"Absorb without Purge" creates dual paths**. New packages (@silvery/headless, @silvery/commands) were created by *copying* code from @silvery/create, not *moving* it. Both locations now have the same code. Old consumers still work — nothing forces migration. *Fix*: After copying to new package, immediately delete from old package and fix breaks. Or if deletion is too risky, create a tracking bead with explicit timeline.

3. **Ambitious /complete criteria never enforced**. Bead era2a-6 said "grep for RenderAdapter → 0 hits" but the file has 14 internal consumers (browser adapters). The criteria was written before implementation revealed the dependency. *Fix*: Write /complete criteria AFTER understanding the blast radius, not before. Update criteria when scope changes.

4. **New packages without tests get shipped**. @silvery/commands was extracted without a test file. Found during audit, not during implementation. *Fix*: Every new package gets at least one test file in the same commit. No exceptions — even if it's just `test("imports work", () => expect(createCommandRegistry).toBeDefined())`.

5. **Barrel exports as discoverability gate**. `withApp()` was implemented and tested but not exported from the main barrel. Users importing `@silvery/create` couldn't find it without knowing the subpath. *Fix*: If it's ready for use, export it from the barrel. If it's not ready, don't ship it at all.

**Lessons for multi-package extraction**:

- **Rename first, split later**. The tea→create rename was clean because it was one operation. Splitting into multiple packages while renaming would have been a mess.
- **One session = one package extraction**. Trying to extract 5 packages in one session led to shallow implementations (copy without delete, no tests for commands). Better: extract one package fully (copy, delete old, fix breaks, test) before starting the next.
- **Audit before closing the epic**. The systematic feature-by-feature audit caught 3 gaps that 3 prior `/complete` runs missed. `/complete` checks for *your session's* changes; a systematic audit checks *the entire feature set*.

---

## Case Study 8: km-tui.tree.v4 — Three Aspirational-Done Failures

**Bead**: km-tui.tree.v4 epic (9 phases). After all 9 phases were closed and the epic marked complete, a systematic re-audit found 3 phases that didn't actually meet their /complete criteria.

### Failure 1: Renamed, not deleted (Phase 10)

Bead said "delete @deprecated ColumnView." Agent renamed `ColumnView` → `DerivedColumn` and closed the bead. The /complete grep `ColumnView` returned 0 hits — passing — but the abstraction still existed under a new name with the same 28 references across 7 files. The `rg` command was technically correct; the spirit of the change was not.

**Re-audit caught it**: a follow-up bead (km-tui.tree.v4.detail-unify) reopened Phase 10, traced the consumers, and either deleted the type or migrated callers. Eventually `DerivedColumn` was renamed AGAIN to `ColumnSnapshot` — but this time the rename was justified (it's a legitimate DTO for non-reactive consumers like the web canvas), and the actual blocker (`deriveDetailColumns`) was deleted.

### Failure 2: Wrapped, not eliminated (Phase 9)

Bead said "Board.tsx ≤12 useEffects, ≤1000 LOC." Agent added the centralized store API (good) and migrated Board.tsx to call the new API from useEffects (good). Closed the bead. But the call counts didn't change — the effects were still there, just thinner. After closing: 21 useEffects, 1356 LOC (target was 12 / 1000). The agent met the spirit of the API change but never measured the numeric targets before closing.

**Re-audit caught it**: a follow-up agent moved signal writes from Board.tsx effects into board-app-store.ts via alien-signals `effect()` and into `syncPaneSignals()`. Final: 10 useEffects (under target), 1336 LOC (still over the 1000 target — acceptable as the practical floor without splitting Board into view + controller).

### Failure 3: Numeric targets ignored

Same as Failure 2 but generalized: **agents do not measure numeric targets before closing beads**. They do work that *feels* like progress, then close. The bead description had `wc -l Board.tsx  # ≤1000`. Nobody ran it.

### The fix in /complete

These three failure modes are now the FIRST step of `/complete`:
1. **Renamed, not deleted** — grep for the new name AND the old name
2. **Wrapped, not eliminated** — measure the structural metric (call count), not just the rename
3. **Numeric targets ignored** — run every measurement command from every closed bead

See `.claude/skills/complete/SKILL.md` Step 1 for the protocol.

### The deeper lesson

**Aspirational-done is a coordination failure, not a memory failure.** The agent didn't forget to check — it never connected "done" with "verify the criteria literally." The fix isn't reminding agents harder; it's making verification the FIRST step of /complete and elevating it above hypothesis investigation. The most important check has to happen first, not at the end where it gets skipped.

---

## See Also

### Principles

- [Quarantine and Delete](../principles.md#principle-quarantine-and-delete) - The underlying principle
- [Legacy Code as Virus](../principles.md#legacy-code-as-virus) - Why old patterns spread
- [The Quality Plateau](../principles.md#the-quality-plateau) - Goal state with one obvious way

### Archive (supplementary detail)

- [docs/archive/domain-object-migration.md](../archive/domain-object-migration.md) - Full migration story
