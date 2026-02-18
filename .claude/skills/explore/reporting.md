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
- GUI/TTY verified: `"10:20 — GUI/TTY verified <bead-id>: /tmp/verify-<id>.png"`
- Screenshot taken: `"10:05 — Screenshot: /tmp/explore-screenshots/NN-name.png"`
- Area explored: `"10:30 — Explored fold/unfold on real vault (120x40) — no issues"`

### Status Dashboard (update description periodically)

Update the session bead's `--description` with the current dashboard. Do this after EVERY bug state transition (found/started/fixed/verified/closed). After updating, print a 1-line status summary to the user: `Dashboard updated: N fixed, M in progress, K awaiting user. See <session-id>.`

```bash
bd update <session-id> --description "$(cat <<'EOF'
## Work Items

| # | Bead | P | Title | Status | Test | AI Verify | User |
|---|------|---|-------|--------|------|-----------|------|
| 1 | km-tui.body-collapse | 2 | Body column collapse | Fixed | 3/3 pass | screenshot | confirmed |
| 2 | km-tui.fold-color | 2 | Fold count color wrong | Open | — | — | — |

Status enum: Open, Investigating, Fix in progress, TUI test pass, GUI/TTY verified, Awaiting user, Fixed, Reopened, Deferred
User column: —, pending, confirmed, rejected. A visual bug CANNOT show Fixed until User = confirmed.

## Coverage
- GUI/TTY: real vault (/tmp/vt), 120x40 + 80x24
- Targeted TUI tests: N tests across M areas
- Health check: N pass, M pre-existing failures

## Screenshots
- /tmp/explore-screenshots/01-startup.png
- /tmp/explore-screenshots/05-collapse.png
EOF
)"
```

**Table rules:**
- `#` = session-local number, assigned in discovery order, never changes
- Never restructure the table mid-session. New rows appended at bottom. No column changes.

### Close Reason (at shutdown)

```bash
bd close <session-id> --reason "Explored <focus area>. Found N bugs (M fixed, K open). N TUI tests, M GUI/TTY screenshots. No regressions."
```

### Session Shorthand Numbers

Each bug gets a sequential `#N` on discovery. Numbers are session-scoped and stable.

- The dashboard table IS the mapping (`#3` → `km-tui.fold-border-blank`).
- Lead uses both in conversation: `"#3 (km-tui.fold-border-blank): fix committed, awaiting TTY"`
- User can say `"what about #3?"` instead of copying bead IDs.

### Close Reason with Incomplete Work

When closing the session, enumerate any incomplete work:

```
"Session complete. N fixed, M deferred. Remaining: #3 (km-tui.X) awaiting
user verification, #7 (km-tui.Y) root cause found but fix not landed."
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

| # | Bead | P | Title | Status | Test | AI Verify | User |
|---|------|---|-------|--------|------|-----------|------|
| 1 | km-xxx | 2 | TUI: [description] | Fixed | pass | screenshot | confirmed |
| 2 | km-yyy | 2 | TUI: [description] | Open | — | — | — |

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

**Incremental checking**: When creating a test for a discovered bug, verify `checkIncremental` is ON (default in `testEnv`). Never create a bug test with `checkIncremental: false`.

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

**GUI/TTY Tests (Interactive TTY):**
- MCP TTY: `mcp__tty__start`, `mcp__tty__press`, `mcp__tty__text`, `mcp__tty__screenshot`, `mcp__tty__stop`, `mcp__tty__wait`
- Screenshots saved to `/tmp/explore-screenshots/`

**TUI Tests:**
- `testEnv()`, `item()` from `apps/km-tui/tests/helpers/board-test.ts`
- `board.press()`, `board.textContent()`, `board.screenshot()` API

**Peekaboo Mode:**
- Peekaboo MCP: `mcp__peekaboo__list`, `mcp__peekaboo__image`, `mcp__peekaboo__hotkey`, etc.

## Session Retrospective (MANDATORY)

Every exploration/bug-fix session MUST end with a deep-dive retrospective — not just a summary of what was done, but a forensic analysis of what went wrong and why. The retrospective is appended to the session bead notes at shutdown.

**The retrospective is NOT optional.** If the lead runs out of context, it must checkpoint the session bead and tell the user to start a new session for the retrospective. A session without a retrospective is incomplete.

### A. Closure Audit

For EVERY bug in the session dashboard:

```
| # | Bead | Times reported | Times assumed fixed | Close accuracy | Root cause of any premature closure |
```

- **Times reported**: How many times this bug (or variants) appeared across sessions. Use `bun recall "<bug keywords>"` and `bd search "<keywords>"` to find prior mentions.
- **Times assumed fixed**: How many times a fix was committed that didn't actually resolve the bug.
- **Close accuracy**: `correct` (fixed on first attempt, user confirmed), `premature` (closed before user confirmed, reopened), `partial` (fixed one case but not all), or `misdiagnosed` (wrong root cause).
- **Root cause of premature closure** categories:
  - `tests-insufficient` — TUI test passed but didn't check what user sees
  - `synthetic-data` — test used simple fixture, real vault triggers the bug
  - `single-operation` — test checked one action, bug needs N actions to manifest
  - `state-only` — test checked state (cursor position) but not visual rendering
  - `layer-2-skipped` — no TTY verification before close
  - `layer-3-skipped` — no user confirmation before close
  - `wrong-root-cause` — fix addressed symptom, not underlying issue

### B. Test Gap Analysis

For each bug that was prematurely closed or required multiple fix attempts:

```
What the test checked: [specific assertions]
What the user actually saw: [their report/screenshot]
Missing assertion: [what would have caught it]
Assertion added: [yes/no — if yes, which test file]
```

This is the most important section — it tells future sessions exactly where the test infrastructure is weak.

### C. Process Failures

- Were any user requests dropped? Which ones, and why?
- Was the dashboard kept current? If not, when did it fall behind?
- Were session shorthand numbers used consistently?
- Did TTY verification complete for all visual bugs?
- Did any agent close a bug it shouldn't have?

### D. What Went Well

- Which fixes landed cleanly on first attempt?
- Which test assertions caught real bugs?
- What communication patterns worked?

### E. Lessons & Skill Doc Updates

- What should be added to MEMORY.md? (forward-looking rules only)
- What skill doc sections need updating?
- What new anti-patterns were discovered?
