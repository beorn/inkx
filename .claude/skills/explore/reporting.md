# Exploration Reporting

The lead writes a summary report at the end of every exploration session (team or solo).

## Team Mode Summary

After shutdown, before committing, the lead produces this:

```markdown
# Exploration Summary

**Date**: YYYY-MM-DD
**Mode**: Team (health-check + explorer-interactive + explorer-targeted + reproducer + fixer)

## Results

| Metric | Count |
|--------|-------|
| Bugs found | N |
| Bugs fixed | N |
| Bugs open | N (beads) |
| Visual issues spotted | N |
| Targeted areas covered | N/6 |

## Visual Exploration

### Screenshots

| # | Screenshot | Description |
|---|-----------|-------------|
| 1 | `/tmp/explore-screenshots/01-startup.png` | Initial board state at 120x40 |
| 2 | `/tmp/explore-screenshots/02-fold-gap.png` | Gap after folding nested items |
| ... | | |

### Visual Findings

- [Description of visual issue, with screenshot reference]
- [Or "No visual issues found — TUI looks clean"]

### Terminal Sizes Tested

- 120x40: [summary of findings]
- 80x24: [summary of findings]

## Beads

| ID | Title | Status | TTY Verified? |
|----|-------|--------|---------------|
| km-xxx | TUI: [description] | Fixed | Yes (screenshot) |
| km-yyy | TUI: [description] | Open | N/A |

## Coverage

- **Interactive**: [areas explored, vault types tested, phases completed]
- **Targeted areas**: [list of areas covered from explorer-targeted]
- **Health check**: [pass/fail, seeds tested, total runs]
- **Real vault**: [tested / not tested, path]

## Files Modified
- `path/to/file.ts` — [what changed]
```

Print this summary to the user, then commit.

## Solo Mode Summary

For non-team exploration (`/explore --fuzz`, `/explore --path`, `/explore <scenario>`):

```markdown
# Exploration: [mode/scenario]

**Bugs found**: N | **Fixed**: N | **Open**: N
**Actions tested**: ~N

## Findings
- [Bug/issue if found, with bead ID]
- [Or "No bugs found — all tests passed"]

## Files Modified
- [list, or "None"]
```

## Dedup: Check Before Creating Beads

Before creating a new bead, search for existing ones:

```bash
bd list --status=open | grep -i "keyword"
```

Match on core symptom, not exact wording. "Blank cards after scroll" and "empty cards on scroll" are the same bug.

## Issue Templates

### Bug Bead

```bash
bd create --type=bug --priority=2 --title="TUI: [brief description]"
bd update <id> --parent km-tui
bd update <id> --claim
```

### Visual Bug Bead

```bash
bd create --type=bug --priority=2 --title="TUI visual: [brief description]"
bd update <id> --parent km-tui
bd update <id> --claim
bd update <id> --notes="Screenshot: /tmp/explore-screenshots/NN-name.png\nTerminal: 120x40\nSequence: [keys]"
```

### Performance Bead

```bash
bd create --type=bug --priority=3 --title="Perf: [brief description]"
bd update <id> --parent km-tui
bd update <id> --claim
```

## Dependencies

**Interactive Mode:**
- MCP TTY: `mcp__tty__start`, `mcp__tty__press`, `mcp__tty__text`, `mcp__tty__screenshot`, `mcp__tty__stop`, `mcp__tty__wait`
- Screenshots saved to `/tmp/explore-screenshots/`

**Headless Mode:**
- `testEnv()`, `item()` from `apps/km-tui/tests/helpers/board-test.ts`
- `board.press()`, `board.textContent()`, `board.screenshot()` API

**Peekaboo Mode:**
- Peekaboo MCP: `mcp__peekaboo__list`, `mcp__peekaboo__image`, `mcp__peekaboo__hotkey`, etc.
