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

## Case Study 2: inkx/chalkx Absorption

**Bead**: km-term-2 epic

**Problem**: `@beorn/tui` depended on inkx, causing module resolution issues.

**Wrong approach**: Re-exported inkx components from tui ("for convenience").

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

---

## See Also

### Principles

- [Quarantine and Delete](../principles.md#principle-quarantine-and-delete) - The underlying principle
- [Legacy Code as Virus](../principles.md#legacy-code-as-virus) - Why old patterns spread
- [The Quality Plateau](../principles.md#the-quality-plateau) - Goal state with one obvious way

### Archive (supplementary detail)

- [docs/archive/domain-object-migration.md](../archive/domain-object-migration.md) - Full migration story
