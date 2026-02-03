# Exploration Reporting

Cleanup, report generation, issue templates, and action workflow.

## Cleanup

**TUI Mode:** No cleanup needed (in-memory)

**GUI Mode:**
```typescript
await mcp__tty__stop({ sessionId })
// Clean temp vault if generated
```

## Report Format

```markdown
# Exploration Report

**Seed**: 12345 | **Iterations**: 100 | **Mode**: TUI

## Summary

| Metric | Count |
|--------|-------|
| Bugs found | 2 |
| Performance issues | 3 |
| Actions executed | 100 |
| View modes tested | 4/4 |
| Max zoom depth | 3 |

## Bugs Found

### 1. Unexpected bell on 'v' key
**Iteration**: 47 | **Seed**: 12345
**Action**: Press 'v' to cycle view mode
**Context**: In columns view, cursor on task-5

Bell triggered without being at boundary.

**Reproduce**: `/explore --seed 12345` (stops at iteration 47)

### 2. No effect on 'j' key
**Iteration**: 73 | **Seed**: 12345
**Action**: Press 'j' (move down)
**Context**: In list view, cursor on task-12

Neither content changed nor bell triggered.

## Performance Issues

| Iteration | Action | Time | Threshold | Context |
|-----------|--------|------|-----------|---------|
| 23 | v (view) | 312ms | 200ms | columns->list, 47 nodes |
| 67 | v (view) | 287ms | 200ms | list->cards, 47 nodes |
| 91 | o (zoom) | 178ms | 150ms | depth 2->3 |

## Coverage

- **View modes**: cards, columns, list, tabs
- **Dialogs**: search, new item
- **Zoom depth**: 0-3
- **Actions**: j(23), k(18), v(12), ...
```

---

## Issue Templates

### Bug Report

```markdown
## Bug: [Brief description]
**Seed**: <seed> | **Iteration**: <n>
**Action**: <key> - <description>

### Context
- View mode: <mode>
- Cursor: on <element>
- Zoom depth: <n>

### Before/After
\`\`\`
[Terminal text diff or description]
\`\`\`

### Reproduce
/explore --seed <seed>
```

### Performance Report

```markdown
## Slow: [Action description]
**Seed**: <seed> | **Iteration**: <n>
**Action**: <key>
**Time**: <ms>ms (threshold: <threshold>ms)

### Context
- View mode: <mode>
- Node count: <n>
- Zoom depth: <n>

### Likely cause
[Analysis of what might be slow]
```

---

## Action-Oriented Workflow

**IMPORTANT**: Don't ask for permission - fix issues as you find them.

When issues are discovered:
1. **Create bead** immediately with `bd create`
2. **Claim it** with `bd update <id> --claim`
3. **Fix it** directly - investigate code, implement fix
4. **Verify** the fix works
5. **Close bead** with `bd close <id> --reason "..."`
6. **Continue** exploring for more issues

```bash
# Bug - create, claim, fix, close
bd create --type=bug --priority=2 --title="TUI: [issue]"
bd update <id> --claim
# ... fix the issue ...
bd close <id> --reason "Fixed by [description]"

# Performance
bd create --type=bug --priority=3 --title="Perf: [issue]"
bd update <id> --claim --add-label "performance"
# ... fix the issue ...
bd close <id> --reason "Optimized [description]"
```

---

## Exploration Summary Template

At the end of exploration, provide a concise summary:

```markdown
# Exploration Summary

**Vault**: /path/to/vault
**Mode**: TUI/GUI/Peekaboo
**Duration**: [time]

## Beads Created
| ID | Title | Status |
|----|-------|--------|
| km-abc | TUI: Empty columns after scroll | Fixed |
| km-xyz | Perf: Slow view switch | Open |

## Issues Found
- **Bugs**: 2 found, 1 fixed, 1 open
- **Performance**: 1 issue identified
- **Rendering**: All views verified

## Coverage
- View modes: cards, columns, list, tabs
- Actions tested: 47
- Columns navigated: 7
- Scroll positions tested: 12

## Files Modified
- `apps/km-tui/src/views/ColumnsView.tsx` - Fixed scroll offset bug
```

## Verification Checklist

Before reporting complete:

- [ ] All iterations completed (or stopped at first bug if requested)
- [ ] Bugs found → beads created → fixes attempted
- [ ] Summary table generated with bead status
- [ ] Files modified listed
- [ ] Coverage stats show what was tested

## Dependencies

**TUI Mode:**
- `testEnv()`, `item()` from `apps/km-tui/tests/helpers/board-test.ts`
- `board.press()`, `board.screenshot()`, `board.expect()` API

**GUI Mode:**
- MCP TTY: `mcp__tty__start`, `mcp__tty__press`, `mcp__tty__text`, `mcp__tty__screenshot`, `mcp__tty__stop`, `mcp__tty__wait`

**Peekaboo Mode:**
- Peekaboo MCP: `mcp__peekaboo__list`, `mcp__peekaboo__see`, `mcp__peekaboo__image`, `mcp__peekaboo__app`, `mcp__peekaboo__type`, `mcp__peekaboo__click`, `mcp__peekaboo__hotkey`

**Shared:**
- SeededRandom for reproducibility
- Weighted action selection
