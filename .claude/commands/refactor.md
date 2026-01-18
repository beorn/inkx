---
description: Systematic code simplification and consistency review
argument-hint: [file-or-directory]
---

# Refactor for Simplicity

Perform a systematic review and refactoring of the codebase (or specified files) to improve simplicity, conciseness, and consistency.

## Target

$ARGUMENTS

If no target specified, review all UI components or the most recently modified files.

## Review Criteria

### 1. Simplification Opportunities

Look for these patterns to simplify:

- **Switch statements** → Replace with lookup objects/Maps when mapping values
- **Verbose conditionals** → Simplify with ternaries or early returns
- **IIFEs** → Simplify to direct expressions or helper functions
- **Repeated patterns** → Extract to shared utilities (but avoid premature abstraction)
- **Nested type checks** → Use Set.has() or type guards
- **Complex destructuring** → Use dot notation if cleaner (e.g., `ui.prop` vs destructuring 20 properties)

### 2. Narrative Flow

Organize code for readability:

- **Most important code first**: Main component/function at top, helpers below
- **Public exports before private helpers**
- **Related code grouped together**
- **Constants at module level**, not inline

### 3. Consistency

Check against project patterns:

- Follow existing naming conventions
- Match established patterns in sibling files
- Align with design docs if present (@docs/08-ui.md for TUI, etc.)

### 4. Avoid Over-Engineering

Do NOT:

- Create abstractions for single-use code
- Add configurability that isn't needed
- Extract helpers for 3 lines of code
- Add type gymnastics that reduce readability

## Process

1. **Analyze**: Read each file and identify simplification opportunities
2. **Plan**: List all changes with before/after code snippets
3. **Review**: Re-evaluate the list - remove changes that are marginal or add complexity
4. **Implement**: Apply remaining changes systematically
5. **Verify**: Run tests to ensure nothing broke

## Output

For each file, provide:

```
## [filename]

### Changes Made
1. [Change description]: [Before] → [After]

### Skipped (marginal benefit)
- [Pattern]: [Reason for skipping]
```

**Keywords**: refactor, simplify, cleanup, clean up, code review, consistency
