---
description: Complexity analysis - find and refactor high-complexity functions
argument-hint: [path]
allowed-tools: Task, Read, Glob, Grep, Bash, AskUserQuestion
---

## Usage

```bash
/code complexity                    # Analyze entire codebase
/code complexity packages/km-storage  # Analyze specific package
```

**Arguments**: `[path]` - optional path to analyze (defaults to `apps packages`)

---

# Complexity Analysis

Static analysis of cyclomatic and cognitive complexity using `oxlint-plugin-complexity`.

## Thresholds

| Metric     | Advisory | High | Critical |
| ---------- | -------- | ---- | -------- |
| Cyclomatic | 20       | 30   | 40       |
| Cognitive  | 15       | 25   | 35       |

**Cyclomatic complexity** counts decision points (if, for, while, case, catch, &&, ||, ??).
Higher = more paths through code, harder to test exhaustively.

**Cognitive complexity** measures how hard code is to understand.
Accounts for nesting depth, else branches, logical operators, recursion.

## Commands

```bash
bun lint:complexity              # Full report (sorted by severity)
bun lint:complexity --json       # JSON for CI/tooling
bun lint:complexity --brief      # One-line per finding
bun lint:complexity <path>       # Specific path
```

## Refactoring Workflow

1. **Identify candidates**

   ```bash
   bun lint:complexity --brief | head -10
   ```

2. **Get LLM suggestions** (optional)

   ```bash
   bun llm deep "How to reduce complexity of functionName in file.ts? Focus on extract method, guard clauses, and lookup objects."
   ```

3. **Apply common patterns**

   - **Extract helpers**: Move nested logic to separate functions
   - **Guard clauses**: Early returns for edge cases
   - **Lookup objects**: Replace switch/case chains with object maps
   - **Decompose conditionals**: `if (isValidUser(user))` vs inline conditions
   - **Replace nested loops**: Use `for...of` with generators or flatMap

4. **Verify improvement**

   ```bash
   bun lint:complexity <file>
   ```

## Common Refactoring Patterns

### Guard Clauses (reduces nesting)

```typescript
// Before: nested conditionals
function process(data) {
  if (data) {
    if (data.valid) {
      // main logic
    }
  }
}

// After: guard clauses
function process(data) {
  if (!data) return
  if (!data.valid) return
  // main logic
}
```

### Lookup Objects (replaces switch)

```typescript
// Before: switch chain
function getHandler(type) {
  switch (type) {
    case "a":
      return handleA
    case "b":
      return handleB
    default:
      return handleDefault
  }
}

// After: lookup object
const handlers = {
  a: handleA,
  b: handleB,
}
function getHandler(type) {
  return handlers[type] ?? handleDefault
}
```

### Extract Method (reduces cognitive load)

```typescript
// Before: inline complex condition
if (user.age >= 18 && user.verified && !user.banned && user.subscriptionActive) {
  // ...
}

// After: extracted predicate
function canAccess(user) {
  return user.age >= 18 && user.verified && !user.banned && user.subscriptionActive
}
if (canAccess(user)) {
  // ...
}
```

## Integration with Code Review

Pattern 27 in `/code review` runs complexity analysis automatically:

```bash
bash scripts/review-code-patterns.sh | grep -A20 "PATTERN 27"
```

## Execute

Run complexity analysis on the specified path (or entire codebase):

```bash
bun lint:complexity $ARGUMENTS
```
