# The Wrong Bug Three Times

**TL;DR**: Always reproduce with the user's actual data before writing any fix. Bead descriptions are hypotheses, not diagnoses.

---

## What Happened

A user reported that pressing J in the board view skipped visible grandchildren — the cursor jumped over cards that were clearly rendered on screen. The bead contained a plausible root-cause analysis pointing to `getVisibleColumnBlocks` using depth-limited traversal. This sounded right: the function used `getVisibleDescendantIds` with `foldDepth` defaulting to depth=1, which would indeed miss grandchildren.

The fix attempt began by trusting the bead's code analysis and writing tests against synthetic fixtures. The synthetic fixtures used 1-level-deep node trees with artificial node types that don't appear in real markdown vaults. Three genuine bugs were found and fixed along the way — depth-limited traversal, off-by-one in fold logic, edge cases in block grouping — but none of them were the bug the user reported. Two hours and four commits later, the actual problem was identified: `getVisibleColumnBlocks` derived its own visibility list (via `getVisibleDescendantIds`) instead of using the ViewTree that drives rendering. Navigation and rendering disagreed about what was visible.

The fix was a one-line change: make navigation read from the same ViewTree that rendering uses. The three "wrong" fixes were real improvements but addressed bugs that didn't manifest with real vault data.

---

## The Causal Chain

1. **Bead contained a plausible-but-wrong diagnosis.** The description said "getVisibleDescendantIds limits to depth=1" — which was true but not the cause. The diagnosis was treated as fact instead of hypothesis.

2. **Reproduction used synthetic fixtures instead of real data.** Test fixtures were 1-level deep (`item("board", item("col", item("task")))`) when the real vault had 2-3 levels of nested headings with children. The synthetic structure couldn't reproduce the actual bug.

3. **Code analysis substituted for observation.** Reading `getVisibleDescendantIds` and seeing the depth limit felt like finding the bug. But the real issue was that navigation used a different data source than rendering — something only visible when running against the user's actual vault structure.

4. **Each "fix" passed synthetic tests.** Because the test fixtures didn't match real data, each fix appeared correct. The tests were green, confidence was high, but the user's bug persisted.

---

## Rules

### 1. Reproduce with the user's actual data first

Before writing any fix, run the app with the user's real vault/file/dataset. If they said "J skips cards in my Asana vault," open that vault and press J. If the data is private, ask for a minimal reproduction file that exhibits the same structure. Synthetic fixtures come second — they codify the fix, they don't find the bug.

### 2. Bead descriptions are hypotheses, not diagnoses

A bead's root-cause analysis is a starting point for investigation, not a confirmed finding. Treat it like a doctor treats a patient's self-diagnosis: worth hearing, but verify before prescribing. Mark unverified analyses as "hypothesis" when writing bead descriptions.

### 3. Test fixtures must include depth-2+ structures

Real markdown vaults have nested headings, sub-items under sub-items, and mixed block types. Test fixtures that only go 1-level deep miss an entire class of tree-traversal bugs. When writing navigation or visibility tests, always include at least one fixture with grandchildren.

### 4. Navigation must derive from the same data as rendering

If the screen shows a card, the keyboard should be able to reach it. Navigation should read from the ViewTree (or whatever drives rendering), not recompute visibility independently. Two sources of truth for "what's visible" will inevitably diverge.

---

## See Also

- [Refactoring Lessons](refactoring.md) — related case studies on migration and deletion discipline
- [TDD Skill](../../.claude/skills/tdd/SKILL.md) — reproduction tool picker and escalation ladder
- [Bug Workflow](../../.claude/skills/pm/workflows/bugs.md) — bead lifecycle for bug fixes
