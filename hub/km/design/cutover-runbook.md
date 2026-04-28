# km bd Cutover Runbook

> **Bead**: `km-beads.cutover` (P1, in_progress) · **Blocker**: `km-beads.split-backend` (P1, in_progress) · **Follow-up**: `km-beads.dolt-archive` (P3)

Two-phase cutover from Go `bd` binary to km-native `km bd`. Phase A is low-risk preparation that can land on main any time. Phase B is the actual binary swap and requires session drain + atomic switch.

---

## Phase A — Skill / hook / doc rewrite (low-risk prep)

`bd <cmd>` and `km bd <cmd>` are synonyms today (per CLAUDE.md). Rewriting one to the other for **ported subcommands** is a no-op behavior-wise — both invocations work, Go bd stays as fallback. Doesn't require agent restart, doesn't require draining other sessions.

### Subcommand parity matrix

**Ported to km bd (170+ skill instances — safe to rewrite as `km bd <cmd>`):**

| Subcommand | Files referencing |
|---|---|
| `bd ready` | 12 |
| `bd list` | 23 |
| `bd show` | 18 |
| `bd create` | 25 |
| `bd update` | 25 |
| `bd close` | 17 |
| `bd drop` | 2 |
| `bd dep` | 8 |
| `bd stale` | 7 |
| `bd orphans` | 1 |
| `bd claim` | 1 |
| `bd children` | 5 |
| `bd blocked` | 6 |
| `bd query` | 3 |
| `bd rename` | 6 |
| `bd migrate` | 3 |
| `bd export` | 2 |
| `bd remember` | 3 |
| `bd memories` | 1 |
| `bd prime` | 3 |

**Advanced — NOT yet ported (31 instances across 14 files — leave as `bd <cmd>`):**

| Subcommand | Files |
|---|---|
| `bd search` | 5 |
| `bd count` | 4 |
| `bd epic` | 4 |
| `bd defer` | 2 |
| `bd doctor` | 2 |
| `bd lint` | 1 |
| `bd formula` | 1 |
| `bd mol` | 1 |
| `bd gate` | 1 |
| `bd undefer` | 1 |
| `bd validate` | 1 |
| `bd delete` | 1 |
| `bd label` | 1 |
| `bd promote` | 1 |
| `bd duplicates` | 1 |

These keep using Go bd (synonym path) until each is ported to km bd. Track via `km-beads.split-backend` follow-up.

### Files to update

- 30 skill files under `.claude/skills/`
- 4 hook files under `.claude/hooks/`
- `CLAUDE.md` (25 hits)
- `docs/**/*.md` (87 hits)
- `.git/hooks/pre-commit` — uses `bd hooks run pre-commit`; **leave as Go bd** (advanced subcommand)

### Phase A execution (when ready)

```bash
# 1. Use batch refactor for the 20 ported subcommands
PORTED='ready|list|show|create|update|close|drop|dep|stale|orphans|claim|children|blocked|query|rename|migrate|export|remember|memories|prime'

bun vendor/bearly/tools/refactor.ts \
  --include '.claude/skills/**/*.md' \
  --include '.claude/hooks/*.sh' \
  --include 'docs/**/*.md' \
  --include 'CLAUDE.md' \
  --regex "\\bbd\\s+($PORTED)\\b" \
  --replace 'km bd \1'

# 2. Verify zero advanced subcommands accidentally rewritten
ADVANCED='search|count|lint|doctor|formula|mol|gate|defer|undefer|epic|validate|human|supersede|delete|reopen|note|tag|label|promote|duplicates'
grep -rEn "\\bkm bd ($ADVANCED)\\b" .claude/skills/ docs/ CLAUDE.md
# Expected: 0 hits

# 3. Spot-check the 4 hook files
grep -n '\bbd\b' .claude/hooks/bd-prime.sh .claude/hooks/session-start.sh .claude/hooks/pre-compact.sh

# 4. Update bd-prime.sh — flip preference from Go-first to km-first
#    (the hook itself stays at .claude/hooks/bd-prime.sh — name is historical)
#    Inside: prefer `km bd prime` first, fallback to `bd prime` (Go) on error

# 5. Add CI detector — Pattern 43 in scripts/review-code-patterns.sh
#    Flags any new `\bbd <ported-cmd>\b` introduced in skills/docs/hooks
#    (so future contributions don't regress to Go bd for ported cmds)

# 6. Run bun fix + targeted tests
bun fix
bun km bd ready --json | head -3       # smoke

# 7. Commit + push to main
git add -A
git commit -m "chore(cutover): rewrite ported bd subcommands to 'km bd' across skills/docs/hooks"
git push origin main
```

### Phase A acceptance

- All 170+ ported invocations show `km bd <cmd>`
- All 31 advanced invocations still show `bd <cmd>` (Go binary)
- Pattern 43 detector returns zero hits (= no regression)
- `bun fix` clean
- `km bd ready` produces output identical to `bd ready` against the same `.beads/` state

---

## Phase B — Binary cutover (high-risk, requires session drain)

This is the **actual** switch — what `km-beads.split-backend` is about: removing Go `bd` so all writes go to `.km/state.db` instead of `.beads/dolt/`.

### Pre-flight gates (ALL must hold)

- [ ] Phase A merged to main + propagated to all active sessions
- [ ] Active claude sessions ≤ 1 (this one): verify with `ps aux | grep "claude\b" | grep -v grep`
- [ ] Tribe daemon shows 0 other clients: `bun vendor/bearly/tools/tribe-cli.ts status`
- [ ] No active worktrees with uncommitted bd writes: `git worktree list` shows main only
- [ ] Last `bd dolt push` from each session has flushed (verify via `bd dolt status`)

### Phase B execution (when window opens)

```bash
# 1. Snapshot dolt state (recovery anchor)
ARCHIVE=/tmp/km-bd-archive-$(date +%Y%m%d-%H%M%S)
mkdir -p "$ARCHIVE"
cp -R .beads/dolt "$ARCHIVE/dolt"
cp .beads/issues.jsonl "$ARCHIVE/issues.jsonl"
cp .beads/config.yaml "$ARCHIVE/config.yaml"
echo "Archived to $ARCHIVE"

# 2. Final dolt push (flush in-flight bead writes)
bd dolt push

# 3. Stop dolt SQL server (PID 8369 has been running 72+ hours)
DOLT_PID=$(pgrep -f "dolt sql-server" | head -1)
[ -n "$DOLT_PID" ] && kill -TERM "$DOLT_PID" && wait $DOLT_PID 2>/dev/null
# Verify: pgrep -f "dolt sql-server" returns nothing

# 4. Move Go bd binary out of PATH (don't delete — keep at .archive/ for rollback)
mkdir -p ~/.local/.archive/bd-rollback
mv "$(command -v bd)" ~/.local/.archive/bd-rollback/bd-go-$(date +%Y%m%d)
hash -r   # flush shell command cache

# 5. Verify km bd is now the sole bd
command -v bd && echo "FAIL: bd still on PATH"  # should error
which km bd

# 6. Update .git/hooks/pre-commit — remove the BEADS INTEGRATION block
#    OR replace `bd hooks run` with `km bd hooks run` once km bd ports `hooks`
#    Until then, the hook block is dead code (bd is gone) — safe to delete
sed -i.bak '/--- BEGIN BEADS INTEGRATION/,/--- END BEADS INTEGRATION/d' .git/hooks/pre-commit

# 7. Test end-to-end
km bd ready                        # smoke
ID=km-cutover.smoke-$(date +%H%M)
km bd create "cutover smoke" --id "$ID" --type task --priority 4
km bd close "$ID" --reason "post-cutover smoke pass"
km bd ready --json | grep -c '"id"'  # confirm responding

# 8. Restart claude sessions (user action — required for them to pick up the new world)
#    Each session: exit + `claude --resume <name>`
#    The bd-prime hook fires on resume and now uses km bd prime

# 9. Mark beads closed
km bd close km-beads.cutover --reason "Phase B complete on YYYY-MM-DD. Go bd archived to ~/.local/.archive/bd-rollback/. Single-writer state confirmed via smoke test."
km bd close km-beads.split-backend --reason "Resolved by cutover — single writer is km bd."
km bd update km-beads.dolt-archive --notes "Eligible for archive: dolt server stopped, .beads/dolt/ snapshot at $ARCHIVE"
```

### Rollback (if Phase B goes wrong)

```bash
# Restore Go bd
mv ~/.local/.archive/bd-rollback/bd-go-* ~/.local/bin/bd
hash -r

# Restart dolt server
bd dolt start

# Restore .beads/dolt from archive if corrupted
cp -R "$ARCHIVE/dolt"/* .beads/dolt/

# Re-add the hook block to .git/hooks/pre-commit from backup
mv .git/hooks/pre-commit.bak .git/hooks/pre-commit

# Sessions restart again, picking up the synonym world
```

---

## Phase B follow-up — port advanced subcommands

After Phase B is stable, port the 15 advanced subcommands to km bd one at a time. Each is a small, well-bounded chore:

- `km bd search` (text search via `repo.query` + FTS)
- `km bd count` (filtered count — wraps `list` with `--count-only` flag)
- `km bd doctor` (drift / sync checks)
- `km bd lint` (template-section validation — uses km-beads validators)
- `km bd defer` / `km bd undefer` (status transition + `defer-until` field)
- `km bd epic` (epic management — wraps `update --type epic`)
- `km bd validate` (calls existing `--validate` flag in different shape)
- `km bd delete` (currently km bd has `drop`; verify if `delete` semantically differs)
- `km bd reopen` (currently no direct command; status update from done → todo)
- `km bd note` (append note field — verify km bd's notes field handling)
- `km bd label` / `km bd tag` (currently km uses inline tags; consider whether explicit command is wanted)
- `km bd promote` (wisp → bead — uncertain if km has wisp concept)
- `km bd find-duplicates` / `bd duplicates` (semantic similarity — large dependency)
- `km bd formula` / `km bd mol` (workflow templates — bigger feature)
- `km bd gate` / `km bd merge-slot` (async coordination — bigger feature)

Track each as a sub-bead under `km-beads.split-backend` or open a new `km-beads.advanced-port` epic.

---

## CI detector (Pattern 43) — to be added to `scripts/review-code-patterns.sh`

```bash
echo "=== PATTERN 43: Stale 'bd <ported-cmd>' in skills/docs/hooks ==="
# After cutover Phase A, ported subcommands should always invoke km bd.
# Catches regressions where a contributor types `bd close` instead of `km bd close`.
PORTED='ready|list|show|create|update|close|drop|dep|stale|orphans|claim|children|blocked|query|rename|migrate|export|remember|memories|prime'
grep -rEn "\\bbd\\s+($PORTED)\\b" \
  .claude/skills .claude/hooks docs CLAUDE.md \
  --include='*.md' --include='*.sh' 2>/dev/null \
  | grep -v node_modules || true
echo ""
```
