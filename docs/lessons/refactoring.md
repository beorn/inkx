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
- Hook names `useLayout` instead of `useContentRect`
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

## See Also

### Principles

- [Quarantine and Delete](../principles.md#principle-quarantine-and-delete) - The underlying principle
- [Legacy Code as Virus](../principles.md#legacy-code-as-virus) - Why old patterns spread
- [The Quality Plateau](../principles.md#the-quality-plateau) - Goal state with one obvious way

### Archive (supplementary detail)

- [docs/archive/domain-object-migration.md](../archive/domain-object-migration.md) - Full migration story
