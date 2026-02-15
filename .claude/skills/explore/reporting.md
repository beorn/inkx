# Exploration Reporting

The lead persists the exploration summary to the **session bead** and prints it to the user. The bead is the permanent record; the printed output is for immediate visibility.

## Session Bead Updates

### Incremental Notes (append after each significant event)

```bash
bd update <session-id> --append-notes "HH:MM — <event description>"
```

Events to log:
- Bug found: `"10:02 — Found bug: <desc> → created <bead-id> (P2)"`
- Bug fixed: `"10:15 — Fixed <bead-id>: <summary>. Verified: TUI test (N/N pass)"`
- GUI verified: `"10:20 — GUI verified <bead-id>: /tmp/verify-<id>.png"`
- Screenshot taken: `"10:05 — Screenshot: /tmp/explore-screenshots/NN-name.png"`
- Area explored: `"10:30 — Explored fold/unfold on real vault (120x40) — no issues"`

### Status Dashboard (update description periodically)

Update the session bead's `--description` with the current dashboard. Do this after major milestones (not after every action):

```bash
bd update <session-id> --description "$(cat <<'EOF'
## Work Items

| # | Bead | Title | Status | TUI Test | GUI |
|---|------|-------|--------|----------|-----|
| 1 | km-tui.body-collapse | Body column collapse error | Fixed | 3/3 pass | screenshot |
| 2 | km-tui.fold-color | Fold count color wrong | Open | — | — |

## Coverage
- GUI (interactive TTY): real vault (/tmp/vt), 120x40 + 80x24
- Targeted TUI tests: N tests across M areas
- Health check: N pass, M pre-existing failures

## Screenshots
- /tmp/explore-screenshots/01-startup.png
- /tmp/explore-screenshots/05-collapse.png
EOF
)"
```

### Close Reason (at shutdown)

```bash
bd close <session-id> --reason "Explored <focus area>. Found N bugs (M fixed, K open). N TUI tests, M GUI screenshots. No regressions."
```

## Team Mode Summary

After shutdown, before committing, the lead:
1. Updates session bead description with the final dashboard (format above)
2. Closes session bead with summary reason
3. Prints the summary to the user

The printed summary matches the bead description plus any additional context:

```markdown
# Exploration Summary

**Session**: <session-bead-id>
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

## Beads

| ID | Title | Status | GUI Verified? |
|----|-------|--------|---------------|
| km-xxx | TUI: [description] | Fixed | Yes (screenshot) |
| km-yyy | TUI: [description] | Open | N/A |

## Coverage

- **Interactive**: [areas explored, vault types tested, phases completed]
- **Targeted areas**: [list of areas covered from explorer-targeted]
- **Health check**: [pass/fail, seeds tested, total runs]
- **Real vault**: [tested / not tested, path]

## Screenshots

| # | Screenshot | Description |
|---|-----------|-------------|
| 1 | `/tmp/explore-screenshots/01-startup.png` | Initial board state at 120x40 |

## Files Modified
- `path/to/file.ts` — [what changed]
```

## Solo Mode Summary

For focused solo exploration (`/explore <scenario>`, `/explore --gui`), you (the lead) create and manage the session bead. Quick modes (`--fuzz`, `--path`) skip session beads — just print results.

```markdown
# Exploration: [mode/scenario]

**Session**: <session-bead-id>
**Bugs found**: N | **Fixed**: N | **Open**: N
**Actions tested**: ~N

## Findings
- [Bug/issue if found, with bead ID]
- [Or "No bugs found — all tests passed"]

## Files Modified
- [list, or "None"]
```

## Session Status Check

To check session status mid-session, read the session bead:

```bash
bd show <session-id>
```

The description has the current dashboard, notes have the event log.

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
# If session bead exists:
bd update <session-id> --append-notes "HH:MM — Found bug: <desc> → created <id> (P2)"
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

**GUI Tests (Interactive TTY):**
- MCP TTY: `mcp__tty__start`, `mcp__tty__press`, `mcp__tty__text`, `mcp__tty__screenshot`, `mcp__tty__stop`, `mcp__tty__wait`
- Screenshots saved to `/tmp/explore-screenshots/`

**TUI Tests:**
- `testEnv()`, `item()` from `apps/km-tui/tests/helpers/board-test.ts`
- `board.press()`, `board.textContent()`, `board.screenshot()` API

**Peekaboo Mode:**
- Peekaboo MCP: `mcp__peekaboo__list`, `mcp__peekaboo__image`, `mcp__peekaboo__hotkey`, etc.
