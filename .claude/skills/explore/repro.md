# Reproducing Unreproducible Bugs

When a bug cannot be reproduced in TUI testing (timing-dependent, terminal-specific, etc.):

## Step 0: Search Prior Sessions

Before debugging from scratch:

```bash
bun recall "symptom keywords"
bun recall --raw --since 2w "affected component"
```

Someone may have already investigated this exact issue. Check for:
- Prior diagnosis or root cause analysis
- Known workarounds or limitations
- Related architectural decisions

## Failed Reproduction Protocol

When you try to reproduce a bug and **fail** (can't trigger it):

1. **Log what you tried** — append to the bead notes with exact key sequences, timing, and vault used:
   ```bash
   bd update <id> --append-notes "Repro attempt: td → typed 'today' → Enter. Dialog closed correctly. Used /tmp/vt vault, 80x24 terminal."
   ```
2. **Use DEBUG_LOG** — always run with `DEBUG='km:*' DEBUG_LOG=/tmp/tui-debug.log` so there's a trace even for "works for me" attempts
3. **Check reproduction conditions** — many bugs only trigger when:
   - Value actually changes (auto-save checks `value !== initialValue`)
   - Component has fully mounted (press Enter too fast → hits old input layer)
   - Real data is used (synthetic fixtures may skip edge cases)
4. **Update the steering doc** — if you learn something about reproduction conditions (e.g., "must type text before confirming"), update this file or the relevant skill doc so the next session doesn't repeat the same failed approach

**A failed reproduction with no notes is wasted work.** The next session will try the same thing and fail the same way.

**P1 bugs: do NOT move on.** If you can't reproduce a P1 after 2 instrumented attempts, escalate to the user for pair debugging. Never leave a P1 as "could not reproduce" and pick up other work.

## Step 1: Run with Debug Logging

Tell user to run:
```bash
DEBUG='km:*' DEBUG_LOG=/tmp/tui-debug.log bun km view /path/to/vault
```

This captures all debug output to a file while they use the TUI normally.

## Step 2: Reproduce the Issue

User should:
1. Navigate to the state where bug occurs
2. Perform the action that triggers the bug
3. Note what they see (blank cards, cursor jump, etc.)
4. Press `q` to exit cleanly

## Step 3: Share Debug Trace

```bash
# Full trace
cat /tmp/tui-debug.log

# Or filtered view
grep -E "render|children|card" /tmp/tui-debug.log | tail -100
```

## What to Look For

The goal is to verify the **DOM and buffer contain exactly what the database says they should** - no more, no less.

**Verification approach:**
1. Query the database for expected nodes at the current zoom level
2. Compare debug trace to see which nodes were rendered
3. Check the buffer output for the actual displayed text

```bash
# Get expected nodes from database
sqlite3 /path/to/.km/state.db "SELECT id, content FROM nodes WHERE parent_id = '<zoom-root-id>' LIMIT 20"

# Compare to debug trace
grep "TreeNode render:" /tmp/tui-debug.log | head -20

# Check buffer for actual text (if captured)
grep "CardColumn card:" /tmp/tui-debug.log
```

| Symptom | What to check |
|---------|---------------|
| Blank card | Does `TreeNode render:` show `content=(empty)` for that node? |
| Missing node | Is there a `TreeNode render:` log for that node ID at all? |
| Wrong content | Compare `content=` in log vs database `content` column |
| Extra content | Node rendered that shouldn't be at current zoom level |
| Wrong position | Check column/card indices in logs, compare to expected layout |
| Wrong size | Check if content is truncated unexpectedly, or columns misaligned |
| Wrong styling | Check item.task.status, selection state, dim flags in render context |

**Beyond content - also verify (depending on the bug):**
- **Relative position**: Items in correct column, correct order within column
- **Size**: Cards/columns have expected dimensions, content not clipped wrong
- **Styling**: Selection highlight, dim/bright, strikethrough, colors applied correctly

## Debug Namespaces

| Namespace | What it logs |
|-----------|--------------|
| `km:tui:render` | TreeNode rendering (new) |
| `km:tui:card-layout` | Card layout calculations |
| `km:tui:nav` | Navigation handlers |
| `km:tui:layout` | Shared component layouts |
| `km:tui:columns` | Columns view |
| `km:perf` | Performance measurements |
| `km:board` | Board state |

## Reporting Template

When user provides debug trace:
```markdown
## Debug Analysis: [Issue Description]

### Reproduction
- **Vault**: [path]
- **Action**: [what user did]
- **Visible symptom**: [blank cards, etc.]

### Debug Trace Analysis
[Paste relevant debug lines]

### Findings
- [What the trace shows]
- [Possible cause]

### Next Steps
- [ ] Add more targeted debug() calls if needed
- [ ] Create bead for the issue
- [ ] Implement fix
```

## Adding More Debug Points

If the existing debug output isn't enough, add targeted debug() calls:

```typescript
import createDebug from "debug"
const debug = createDebug("km:tui:render")

// In the component:
debug("SomeComponent: context=%o", { key: value })
```

The `debug` package is already a project dependency. All debug output goes to stderr by default, or to `DEBUG_LOG` file if that env var is set.
