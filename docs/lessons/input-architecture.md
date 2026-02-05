# Lesson: Understand the Architecture Before Changing It

**Keywords**: architecture, input, command system, exploration, planning

## What Happened

Task: migrate Board.tsx from `useInput` to `useInputLayer` so InlineEditField's text capture works without key conflicts.

A previous session (commit `2776b88f`) had already migrated dialogs (SearchDialog, NewItemDialog, ProjectPicker) to `useInputLayer`. Board was left on `useInput` with a manual guard (`if (ui.inlineEditNodeId) return false`) to suppress key conflicts during inline editing.

The planning session saw dialogs using `useInputLayer` and pattern-matched: "DetailPane should get one too for h/j/k/Esc." It designed the plan mechanically — swap `useInput` for `useInputLayer`, give each component its own layer — without exploring the command system.

During review, the user asked: "I thought input handling happened in a command/keybinding/mode/context system centrally, not in the component?" That single question revealed the entire plan was architecturally wrong.

## Why It Happened

**The planning session copied the dialog pattern without understanding it.**

The dialogs use `useInputLayer` because they have text input — raw character capture that the command system can't represent. That's the correct use of the primitive. But the planner saw "dialogs use `useInputLayer` for their keys" and generalized to "components should use `useInputLayer` for their keys." The distinction between text input (raw characters) and discrete commands (h/j/k) was never examined.

Meanwhile, the command system already had everything needed:
- `isInDetailPane` in `KeybindingContext` — the context flag existed
- `when` predicates on keybindings — conditional resolution existed
- `CLOSE_DETAIL_PANE` action type — the action existed
- `handleCloseOrQuit` — already handled detail pane for Escape

A 5-minute exploration of `@km/commands` would have revealed all of this. The planning session never looked there because it treated the task as a mechanical migration within `apps/km-tui/src/views/`, not as a change to the input architecture.

## The Meta-Lesson

**Before changing how a subsystem works, understand why it works that way.**

1. **Explore adjacent systems.** The task touched input handling, but the planner only read view components. Reading the command system (`packages/km-commands/`) would have shown the intended architecture immediately.

2. **Don't pattern-match — understand the abstraction.** Dialogs use `useInputLayer` for text input. DetailPane needs discrete command routing. These are different problems requiring different solutions. Pattern-matching "component handles keys → useInputLayer" skipped the critical distinction.

3. **Question the plan.** "Add `useInputLayer` to DetailPane" should have triggered: "Why would a rendering component handle input? How does the rest of the app handle discrete commands?" Instead it was executed mechanically.

4. **Guards are a smell.** The `inlineEditNodeId` guard in board-input.ts was a workaround for `useInput`/`useInputLayer` not participating in the same consumption stack. The planning session treated the guard as "something to clean up" rather than asking "why does this conflict exist, and what's the right fix?"

## Root Cause Fix

The architecture wasn't documented where agents would see it. Added:
- `.claude/skills/tui/design.md` — Input Architecture section with the rule
- `vendor/beorn-inkx/CLAUDE.md` — Architecture Note clarifying `useInputLayer` purpose
- This document

The deeper fix: **if an architectural invariant isn't written where agents read it (CLAUDE.md, skills), the invariant doesn't exist for agents.** Document design decisions in the files that get loaded into context, not just in code comments that may never be read.
