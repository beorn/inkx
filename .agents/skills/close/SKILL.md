---
description: "Graceful session shutdown. Wraps up agent team, background tasks, and shells if idle; warns about unfinished work and offers /complete + /merge before exit. `/close tribe` broadcasts the same protocol to all tribe members."
argument-hint: "[tribe] [--force]"
allowed-tools: Bash, Read, Skill, AskUserQuestion, TaskList, TaskStop, TeamDelete, SendMessage
benefits-from: [complete, merge, tribe]
---

# Close — Graceful Session Shutdown

**Keywords**: close, shutdown, wrap up, finish, end session, disconnect, exit, quiesce, sign off

One job: leave the workspace and this session's coordination state in a clean stop-able condition. After `/close` returns success, killing this Codex session loses no work.

`/close` is the inverse of session start. It does NOT kill user-global infrastructure (the tribe daemon, MCP servers, the user's shell). It DOES retire what this session created: spawned agent teams, background tasks/monitors, throwaway shells.

## Argument

**Argument**: $ARGUMENTS

| Form | Behavior |
|---|---|
| `/close` | Shut down this session's resources only |
| `/close tribe` | Same, plus broadcast a `/close` request to every tribe member |
| `/close --force` | Skip the idle wait — kill teams/tasks/shells immediately |
| `/close tribe --force` | Broadcast force-close to tribe |

`--force` is a last-resort flag. Default is "let idle work finish."

## Step 0 — resolve this session's id

Everything below depends on knowing the current Codex session id. It's the join key
between team configs, task ledgers, transcript jsonl, and process tree.

```bash
# Option A: env var (set by some harnesses; the name is historical)
sid="${CLAUDE_SESSION_ID:-}"

# Option B (fallback): newest jsonl in this project's transcript dir
if [ -z "$sid" ]; then
  proj=$(pwd | sed 's|/|-|g')
  sid=$(ls -t ~/.codex/projects/${proj}/*.jsonl 2>/dev/null | head -1 \
        | xargs -I{} basename {} .jsonl)
fi
echo "session id: $sid"
```

If `$sid` is empty after both attempts, abort `/close` and ask the user for their session
id (`/status` shows it). Without `$sid`, every authoritative-source check below is unsound.

## Step 1 — inventory live resources

Build the kill list before touching anything. Seven surfaces, in priority order — DO NOT skip any:

1. **Agent teams I LEAD** — authoritative source is `~/.codex/teams/<team>/config.json`, NOT `TaskList`.
   `TaskList` only shows the current session's tasks. Teams created in a prior session
   (especially ones rolled over through `/compact`) won't appear there. The fix:
   ```bash
   # CLAUDE_SESSION_ID may not be set — derive it from the most recent transcript jsonl.
   # Do not infer from Claude Code hook state; Codex does not use that hook surface.
   sid="${CLAUDE_SESSION_ID:-$(ls -t ~/.codex/projects/$(pwd | sed 's|/|-|g')/*.jsonl 2>/dev/null | head -1 | xargs -I{} basename {} .jsonl)}"

   # Find every team where I am the lead
   for cfg in ~/.codex/teams/*/config.json; do
     lead=$(jq -r '.leadSessionId // ""' "$cfg" 2>/dev/null)
     [ "$lead" = "$sid" ] && echo "LEADING: $(jq -r '.name' "$cfg") — $(jq -r '.members | length' "$cfg") members"
   done
   ```
   For each leading team, read the task state from `~/.codex/tasks/<sid>/*.json`
   (the per-session task ledger; cat all `*.json` and parse — these are the authoritative
   in_progress / pending / completed records).

2. **Agent teams I am a MEMBER of** — search the same configs for `members[].agentId`
   matching this session. Membership matters less for `/close` (I can't delete a team I
   don't lead) but I should leave the team gracefully via `SendMessage` to the lead.

3. **Background tasks** — anything spawned with `run_in_background: true` (Bash, Agent, Monitor).
   Don't rely on memory of IDs you spawned. Two authoritative sources:

   **a. Session transcript** — every `run_in_background: true` call is recorded:
   ```bash
   transcript=~/.codex/projects/$(pwd | sed 's|/|-|g')/${sid}.jsonl
   # Bash background calls — find launches without a matching TaskStop
   grep -o '"task_id":"[^"]*"' "$transcript" 2>/dev/null | sort -u
   # Cross-reference: which task_ids appear in TaskStop tool_use blocks
   grep -B2 -A2 'TaskStop' "$transcript" 2>/dev/null | grep -o '"task_id":"[^"]*"' | sort -u
   # Diff = still-live tasks
   ```

   **b. Process tree under Codex** — every running bg-task has a live child process:
   ```bash
   # Find this Codex's pid (parent of this bash)
   ccpid=$(ps -o ppid= -p $$ | tr -d ' ')
   # While that pid still has a parent that looks Codex-ish, walk up
   while ps -o command= -p "$ccpid" 2>/dev/null | grep -qE '(bash|zsh|sh)$'; do
     ccpid=$(ps -o ppid= -p "$ccpid" | tr -d ' ')
   done
   # List children of the Codex process
   pgrep -P "$ccpid" 2>/dev/null | xargs -I{} ps -o pid,etime,command -p {} 2>/dev/null
   ```
   Live children that aren't the tribe MCP or the user's shell are this session's
   background tasks. Cross-reference with the transcript to label them.

4. **Foreground shells / orphaned procs** — Bash tool calls are synchronous and don't
   leak by themselves, but spawned `nohup` / `disown` / `&`-backgrounded processes from
   prior tool calls DO outlive the call:
   ```bash
   # Long-running user-owned procs not tied to this Codex's tree
   ps -eo pid,ppid,etime,command -u "$USER" \
     | grep -E '(bun |node |tsc |vitest |watch|tail -f)' \
     | grep -v grep | grep -v tribe-daemon | head -20
   ```
   Cross-check ppid: anything whose ancestry traces back to THIS Codex's pid is
   mine to consider; everything else is the user's or a peer session's.

5. **Worktree branches with un-merged commits** — `git worktree list --porcelain` +
   `git log origin/main..HEAD` per worktree. Only flag worktrees this session created
   (others belong to peer sessions).

6. **In-progress beads claimed by this session** — `km bd list --status wip --assignee "$USER" 2>/dev/null | head -20`.

7. **Uncommitted changes** in the main repo and any worktree this session touched — `git status --porcelain`.

**Critical**: do NOT trust `TaskList` alone for team detection. The 2026-04-29 incident: a
team created pre-compact was invisible to `TaskList` post-compact, so the original `/close`
report claimed "no team to retire" while four teammates (`gitignore-finisher`,
`rebuild-completeness`, `migrate-postcondition`, `kmadd-parser`) were still registered.
Always check `~/.codex/teams/` first.

Print one table:

```
Live: 4
  surface             state                action on /close
  ──────────────────────────────────────────────────────────
  agent-team:wave2    2 tasks in_progress  wait 60s, then TeamDelete
  bg-task:tsk_abc     idle (last 12m ago)  TaskStop
  bg-task:tsk_xyz     running (build)      WAIT or --force
  km-foo.bar (claimed) 0 commits today     warn user, leave open
```

## Step 2 — warn about unfinished work, offer /complete + /merge

For anything classifiable as "real WIP" — uncommitted changes, un-merged worktree commits, claimed beads with un-pushed work — surface to the user:

```
⚠ Unfinished work detected:
  • Uncommitted: apps/silvercode/src/App.tsx (+/-)
  • wt3 ahead 2 commits, not merged
  • km-storage.foo claimed 3h ago, no commit attached

Options:
  1. Run /complete now — verify acceptance, then I'll wait for /merge
  2. Run /merge --dry-run — show what would integrate, no action
  3. Leave as-is — I'll close anyway and you handle it next session
  4. Cancel /close
```

Use `AskUserQuestion`. On choice 1: invoke `Skill("complete")`. On choice 2: invoke `Skill("merge")` with `--dry-run`. After completion of either, re-enter Step 1 (the surface set may have shrunk).

If `--force` is set, skip this step but still PRINT the warning so the user sees what they're losing.

## Step 3 — quiesce idle resources

For each row in the live table whose state is **idle**:

### Agent team — graceful shutdown
1. Send each teammate a shutdown request:
   ```
   SendMessage({to: "<teammate-name>", message: {type: "shutdown_request"}})
   ```
2. Wait up to 60s (poll `TaskList` every 5s) for all members to mark their tasks completed and go idle.
3. `TeamDelete()` — clears team + task list dir.

If a teammate is mid-turn after 60s and `--force` is NOT set, ask the user:
```
"Teammate <name> still working on <task>. Wait another 60s, force-stop, or cancel?"
```

### Background tasks — TaskStop in order of safety
- Stop monitors first (safe — they're just watchers).
- Stop bash background tasks next (they may have side effects but are idempotent if well-formed).
- Stop background agents last (they may have uncommitted work — prefer waiting them out unless `--force`).

```
TaskStop({task_id: "<id>"})
```

### Foreground shells (orphaned)
Don't kill processes you didn't start. Just list them and warn:
```
"⚠ Possibly-orphaned processes: pid 12345 (bun vitest run), pid 67890 (tsc --watch).
 These were not started by this session. Kill manually if stale: kill <pid>"
```

## Step 4 — busy-wait or force

Re-poll the surfaces from Step 1. Anything still busy:

- **Default**: print `"Waiting on <N> busy resources, max 5 min..."` and busy-wait with 30s polls. After 5 min, surface to user.
- **With `--force`**: kill everything regardless of state.

## Step 5 — final report

```
✓ Closed — session ready for shutdown
  team: shut down (3 members released)
  bg-tasks: 4 stopped, 0 left
  shells: 0 orphans
  worktrees: 1 retained (wt3, noted in km-foo.bar)
  beads: 2 still claimed (km-foo, km-bar — left open intentionally)
  uncommitted: clean

Suggested next:
  • Exit this Codex session
  • /tribe status — confirm peer sessions notified (if /close tribe was used)
```

Or:

```
⚠ Stopped — N items still need attention:
  • bg-task tsk_xyz still running build (5m elapsed)
  • wt5 has uncommitted changes
  • km-baz claimed but no commits this session

Re-run /close --force to override, or handle manually then re-run /close.
```

## `/close tribe` — broadcast to peers

When the argument starts with `tribe`:

1. **First**, run Steps 1-5 for THIS session normally (don't ask peers to clean up while you're still messy).
2. Then broadcast:
   ```bash
   bun /Users/beorn/Code/pim/km/vendor/bearly/tools/tribe-cli.ts send "*" \
     "/close request — please run /close yourself if you're at a stopping point. Reply 'closing' or 'stay-up'."
   ```
3. Wait briefly (~30s) for replies. Summarize:
   - Members who replied "closing" → left to handle their own /close
   - Members who replied "stay-up" → left running, noted
   - Members silent → flagged but not nagged (their session, their call)
4. Do **NOT** stop the tribe daemon. It's user-global infrastructure that other sessions and the user's shell may depend on. Killing it is the user's job (`bun tribe stop` from a non-tribe-using session).

`/close tribe --force` adds: after the 30s wait, send a second broadcast `"/close --force was invoked. Disconnect now if you have not already."` Still does not stop the daemon.

## What `/close` does NOT do

- **Does not stop the tribe daemon.** That is `bun tribe stop` and is the user's call.
- **Does not stop MCP servers.** They're managed by Codex; closing the session releases them.
- **Does not exit Codex.** That's user-driven. `/close` leaves the workspace ready; the user types `exit` or kills the terminal.
- **Does not push uncommitted work.** That belongs to `/commit` + `/merge`. `/close` only warns.
- **Does not close beads.** Beads close when their work is done, not when a session ends. Claimed-but-stale beads get a `--release` offer in `/merge`, not here.

## Anti-patterns

- **Trusting `TaskList` alone for team detection.** It only sees the current session's
  task ledger. Teams that rolled over through `/compact` or were created in a parent
  session are invisible there. Always check `~/.codex/teams/<team>/config.json` first
  and match `leadSessionId == $sid`. The 2026-04-29 incident: `/close` reported
  "no team to retire" while four teammates (`gitignore-finisher`, `rebuild-completeness`,
  `migrate-postcondition`, `kmadd-parser`) were still registered in
  `~/.codex/teams/km-bead-fixes/config.json`.
- **Trusting agent memory for background-task IDs.** After `/compact`, those IDs are gone.
  Use the session transcript jsonl + process tree, not "what I remember spawning."
- **Killing the tribe daemon as part of `/close`.** It's user-global. Only the user (or a
  non-tribe session) shuts it down. Re-learned 2026-04-29.
- **Force-stopping a background agent without checking its state.** May lose un-pushed
  work. Wait it out unless the user explicitly says `--force`.
- **Skipping the warning when `--force` is set.** The user needs to see what they're discarding.
- **Calling `/close` reflexively at the end of every session.** Most sessions should end
  via natural `/complete` + `git push`. `/close` is for sessions with active teams,
  background tasks, or coordination state — not pure-coding sessions.
- **Asking the user 5 questions in a row.** One AskUserQuestion call per decision point.
  Bundle related options.
- **Closing while `/loop` or `/schedule` is active.** Those need explicit `--kill`
  (handled by `/merge --kill`, not here).
- **Skipping Step 0.** Without `$sid` resolved, every authoritative-source check is a
  guess. Abort early if you can't resolve the session id.

## Pairs with

- **`/complete`** — verifies the work is correct. Run BEFORE `/close` if there's WIP.
- **`/merge`** — integrates worktree branches back to main. Run BEFORE `/close` if worktrees are ahead.
- **`/checkpoint`** — preserves narrative for next session. Run BEFORE `/close` if context is rich and you want it back next time.
- **`/tribe`** — peer coordination. `/close tribe` broadcasts via tribe-cli, but the daemon stays up.
