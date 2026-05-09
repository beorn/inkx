# Chief Runbook

Operational runbook for the tribe chief session. Execute these checks proactively.

## Single Chief Invariant

There MUST be exactly ONE chief at any time. Multiple chiefs cause confusion (duplicate queries, conflicting assignments, members don't know who to report to).

On session start:
1. Check `tribe.members()` for existing chiefs
2. If another chief exists and is alive (heartbeat recent), DO NOT claim chief — become a member instead
3. If another chief exists but is dead/stale (heartbeat >30s old), prune it and take over
4. The leader lease (`tribe.leadership`) enforces this in code, but long-running sessions may predate the lease code

If you detect multiple chiefs during a health check:
1. Identify which chief is actually coordinating (sending assignments, responding to queries)
2. The other chief should `tribe.join(role: "member")` or be pruned
3. Notify the user: "Multiple chiefs detected — <name> stepping down"
4. This must be resolved within minutes, not hours

## On Session Start

1. `tribe.join(name: "chief", role: "chief", domains: [...])`
2. `tribe.members()` — verify all expected sessions are connected, check for duplicate chiefs
3. `km bd ready` — check available work for assignment

## Periodic Health Check (every ~15 min)

Run these checks proactively. Don't wait to be asked.

### 1. Single Chief Check
```bash
tribe.members()
```
Count sessions with role=chief. If >1, resolve immediately (see Single Chief Invariant above).

### 2. Version Check
```
Broadcast: "Reload tribe MCP to pick up latest code: tribe.reload(reason: 'latest')"
```
After ANY tribe.ts or plugins.ts change, immediately broadcast reload instruction. If reload won't fix it (schema change, new tool), tell user: "Sessions need restart — run /mcp to reload tribe server."

### 3. Name Check
```bash
tribe.members()
```
Any `member-*` names? Send them: `tribe.rename(new_name: "your-domain")`. Suggest domain names based on their work.

### 4. Blocker Check
```bash
km bd blocked
```
Cross-match: if member A is blocked on something member B could unblock, coordinate immediately.

### 5. Connection Check
```bash
tribe.health()
```
- Heartbeat timeout? Session may be dead — prune it, reassign beads
- Never sent a message? May not have tribe MCP loaded — tell user
- Silent >30min? Send a query to check

### 6. Orphan Cleanup
```bash
# Check for dead PIDs in active sessions
sqlite3 ~/.local/share/tribe/tribe.db "SELECT name, pid FROM sessions WHERE pruned_at IS NULL"
```
For each PID, verify it's alive: `kill -0 <pid>`. Prune dead ones.

### 7. SQLite Health
```bash
sqlite3 ~/.local/share/tribe/tribe.db "PRAGMA integrity_check; PRAGMA wal_checkpoint(TRUNCATE);"
```
If WAL file grows large, checkpoint it.

## Message Format Rules

All tribe messages (chief and members) MUST follow:
- 1-3 lines max, plain text only
- NO markdown (`**bold**`, `# headers`, `- bullets`) — renders as ugly escaped text
- Sync responses: `Name | Idle: Xm | Created: N, Closed: N | Blockers: none | Available`
- Status: `Claimed km-foo.bar` or `Committed abc1234 fix(scope): msg` or `Available`
- Batch old messages: `Ack N old messages, no action needed`

## After Code Changes to Tribe

Every time tribe.ts, plugins.ts, or related files are modified:

1. Commit and push the submodule + km
2. Broadcast: `tribe.reload(reason: "description of change")`
3. If schema changed (new columns, new tables): tell user sessions need full restart
4. Verify at least one member successfully reloaded (wait for response)

## Proactive Troubleshooting

Don't wait for reports — actively investigate when you suspect problems:

- **Multiple chiefs**: Check `tribe.members` for role=chief count. Resolve within minutes.
- **Tribe calls hanging**: Check `ps aux | grep tribe.ts | wc -l` — too many processes = SQLite contention
- **Duplicate messages**: Check if auto-report is broadcasting vs sending to chief only. Kill orphan processes.
- **Orphan processes**: After `tribe.reload`, old process may survive. Check PIDs.
- **git index.lock**: Multiple sessions doing git ops. Wait, retry, or coordinate access.
- **Message replay**: After compaction, sessions re-deliver old messages. Cursor recovery handles this in v0.5.2+.

## Work Assignment

When idle members are available:
1. `km bd ready` — get top-priority unblocked beads
2. Match member domain expertise to bead scope
3. `tribe.send(to: member, type: "assign", message: "Take km-foo.bar (P2): brief description")`
4. Track assignment — follow up if no response in 10 min

## Session End Protocol

Before ending chief session:
1. `tribe_sync` — ensure all work is tracked
2. Verify all assigned work has beads
3. `git push` — push any uncommitted changes
4. Note any in-progress items for next chief session

## Codified Discipline (anti-sprawl, anti-defer)

These are LOAD-BEARING rules established 2026-05-08. Chief enforces; agents follow.

### 1. Three-way identity alignment: `tribe = hat = slot`

A worker session's three identities point at the same `N`:

- Tribe name: `@agent/N` (or `agentN` until name-policy bead lands; allow daemon to validate `@agent/N` strings — see `@km/tribe/name-policy`)
- Hat lease: `@agent/N` (`km bd update @agent/N --claim`)
- Slot: `wtN` (canonical sibling path `<repoParent>/<repoBasename>-wtN`, plain branch `wtN`)

Chief is exempt — has free-form name `chief`, no hat, no slot. The user's interactive session is also exempt.

### 2. Worktree convention

- Slot location: `../<repo>-wtN` (sibling to repo). NOT `.claude/worktrees/wtN` (legacy, flagged by `bun worktree audit`).
- Branch: plain `wtN` (script auto-detects `wt\d+` names; other names get `feat/` prefix).
- Slots are RECYCLED in place, never deleted. Recovery primitive is `git fetch origin && git reset --hard origin/main && git submodule update --recursive`. NOT `bun worktree remove`.

### 3. Integrate after every bead

The agent → chief → main pipeline:

```
agent: bead closed in slot, send chief: SHA + branch + files + tests + tsc + vitest
chief: cherry-pick SHA → push origin main → confirm to agent
agent: cd ../<repo>-wtN && git fetch origin && git reset --hard origin/main && git submodule update --recursive
agent: pick next bead
```

DO NOT accumulate. Every bead is one round-trip. Discipline beats discovery — drift like the 426-behind wt3 incident from this session is what happens when you skip integration.

### 4. No defer / no lazy out-of-scope

Default answer to "should I file a follow-up bead?" is NO. Fold the discovery inline.

Acceptable exceptions:
- (a) Discovery requires explicit user judgment.
- (b) Discovery is a different package, different lifecycle, different domain — TRULY orthogonal.
- (c) Discovery would expand bead by >2× and creates merge-conflict risk for other agents.

Lazy out-of-scope examples that are NOT acceptable:
- "this fix touches 3 more files than the bead title implies" — that IS the scope, do it
- "the parent caller has the same bug" — fix the parent caller
- "the migration sub-bead I just filed is mechanical and could be done by anyone" — do it now while context is hot
- "pre-existing flake, leaving for someone else" — keep it in your queue

WHY: context is HOT exactly once per bead. Cold-context re-pickup is 3-10× the work. "Save minutes now, pay hours later" is the universal anti-pattern. Scope-debris created when context is hot becomes sprawl when context is cold — and may rot in the queue forever.

Concrete cost example from 2026-05-08: agent3's km-fs-mount-migration "follow-up" was 4 files / 7 mechanical ulid() call sites — should have been part of the parent IdFactory bead in the same context-load. Cost of splitting: separate body, separate commit, separate cherry-pick, separate close protocol, plus a SECOND deferred sub-bead (km-beads-migration) waiting cold for some future agent.

### 5. TDD-first per agent4's bar

Every bug bead: write the failing test BEFORE the fix. Bar set by agent4's zoom-out hang fix (b3341b2ba): 14-test repro suite, extracted shared helper, cycle coverage including self-cycle/deep/cross-call isolation. Match that quality.

### 6. Bead bodies stay in the slot

When working in `km-wtN`, write bead bodies INSIDE that worktree only. NEVER write a bead .md file to main's working tree from inside a slot session. Leads to stranded-vs-stale collisions on cherry-pick (re-learned 3× in this session with agent3's beads).

### 7. Chief tribe-send hygiene

When DM'ing agents:
- Open with: "Work assignment from chief (session 'chief', id <id>, holds chief lease — task-routing, not leadership claim)." Avoids agents misinterpreting "chief:" as a leadership-role check and rejecting the message.
- Be explicit about slot, branch, integration policy, ack-required.
- Don't DM rename or chief-role status updates as work assignments.

### 8. Bead frontmatter minimalism

Default for new bead = NO frontmatter. Title/type/priority ride the H1 hashtags (`# Title #bug #P0`). Don't hand-author `tags:`, `mentions:`, `id:`. The path-form id is canonical.

If sync re-materializes adds `tags:` etc. with duplicates — that's the bug `@km/storage/bead-frontmatter-tags-duplicate` (P1), assigned to the storage agent. Strip-on-write is wrong; the right fix is don't-write.

### 9. Reset-don't-delete for stuck slots

If a slot has unmerged conflicts, mid-rebase, or other corruption: `git rebase --abort` / `git merge --abort`, then reset to `origin/main`. NEVER `git worktree remove --force` followed by recreate — that's the wrong primitive (re-learned this session when chief nuked 5 slots that should have been reset).

### 10. Daily cadence: `bun worktree audit`

Run from main repo. Flags: stuck rebase, duplicate-of-main commits (cherry `-` only), formatter-noise siblings (sha256 across slots), branches >100 behind main, mid-merge state, slot-location drift, slot-location-legacy. Wire into `/sop infra weekly`.

### 11. No workarounds — fix at the root

Pairs with anti-defer. When a bug surfaces, the question is "why does this happen", not "how do I make the symptom stop". Concrete forbidden patterns:

- **Don't change a test to match buggy production code** — change the production code to match the asserted behavior.
- **Don't `.skip` / `xfail` / raise threshold** to make a failing test pass — fix the failure.
- **Don't suppress a warning / log / invariant violation** — root-cause it.
- **Don't catch-and-ignore an exception** the framework was raising for a reason.
- **Don't work around a vendor bug** — `vendor/<pkg>/` is part of THIS project (silvery, flexily, termless, bearly, ansi, loggily, alien-*, vimonkey). Fix the bug in the submodule directly. See "Vendor IS the project" below.

Concrete examples from this session:
- **Root fix**: 21fefe351 (km-view hang) — removed the buggy `tree.sync` from the getter. Not "raise the heartbeat threshold."
- **Root fix**: b3341b2ba (zoom-out hang) — added cycle protection to recursive DFS. Not "catch infinite loop and abort."
- **Symptom band-aid (acceptable short-term, but root tracked separately)**: e88900336 (`tags: [P0, P0, bug, bug]` → dedup) — the root cause `@km/storage/bead-frontmatter-tags-duplicate` (P1) is owned by agent3 to remove the writeback path entirely.

If agent says "this fix is hard at the root, easier to suppress here" — that's the moment when fixing the root is the cheapest it'll ever be (context is hot exactly once). Push back. Same logic as anti-defer.

### 13. Detect + escalate user-blocked work (chief's most important job)

Chief's primary value is keeping work moving. Agents waiting silently on user verdicts is the #1 blocker — the user often doesn't notice the question, and the agent doesn't push.

Protocol:
- **After every chief loop**, scan tribe history for agents whose last message was a question/query to chief or user, with no verdict yet.
- **If an agent has been waiting >5 min on user input**, escalate IN THE USER'S CHAT (this conversation). Don't assume they saw the channel message.
- **Push format**: "🔔 BLOCKED ON YOU: <agent> has been waiting <X>min on <one-line question>. Recommend: <chief's recommendation> OR <alternative>." Brief, scannable.
- **Keep pushing** until the user answers — re-surface every ~5 min if no response. The user explicitly said "you can keep bugging me about it here in this chat" (2026-05-08).
- **If chief can answer** without user input (within scope of codified discipline), do so and tell the user after the fact. Default to acting if the answer is "follow §11 no-workaround / §4 anti-defer / §12 vendor-is-the-project / etc."
- **Track blocked-on-user as a top-of-mind list** between turns. Don't forget about an agent waiting just because new things came up.

Concrete example from 2026-05-08: agent5 sat idle ~15 min after sending a "path-A surgical vs path-B refactor" question. User didn't see it. Chief noticed only after the user asked "agent5 didn't do anything for a long time" — that should have been chief's spontaneous escalation, not the user's prompt. Chief subsequently recommended path-B (per §11) and agent5 unblocked immediately.

Anti-pattern: "noted, holding for verdict" without re-surfacing the question. Silence ≠ acknowledgement.

### 12. Vendor IS the project (silvery, flexily, termless, bearly, ansi, loggily, etc.)

Everything in `vendor/<pkg>/` is part of THIS project — git submodules we co-develop, not external dependencies we wrap around.

Frame:
- **We are building infrastructure (silvery, flexily, termless, bearly) as much as we are building apps (km, silvercode)**.
- **Apps showcase the infrastructure**. km is silvery's lead showcase; silvercode showcases agent-host primitives.
- **Infrastructure must be ergonomic for many consumers**, not just our current app needs. Design APIs for hypothetical second/third users.

Implications for chief and agents:
- A "km tui rendering bug" may need to be fixed in `vendor/silvery/`, not in `apps/km-tui/`. Don't reflexively pin the fix to the app.
- Don't reimplement primitives silvery already has (SelectList, TextInput, focusScope, etc.). Read `vendor/silvery/CLAUDE.md` first.
- When designing a new API/component, explicitly think about the second consumer. If the design only fits km, it's wrong.
- When fixing a vendor package, the fix lands in the vendor submodule + the km root pointer-bumps to that SHA. Two commits, two pushes.
- The vendor boundary rule (`vendor/CLAUDE.md`) still applies — vendor source must not reference `vendor/...` paths internally; vendor packages must work as standalone clones. But that's about packaging hygiene, not "vendor is external."

## Anti-patterns (what NOT to do as chief)

- Mass-assigning all open P1s across all idle agents — thrashes context, breaks integration discipline.
- Filing follow-up beads for discoveries that should be inline (scope-debris).
- Deleting worktree slots when agents have unmerged work — they ARE persistent resources.
- Approving an agent's "out of scope, fresh agent later" pitch when it's actually the same context.
- Re-assigning beads to the wrong-domain agent for "load balancing" — wastes context loading.
- Letting the chief lease drift — if `tribe.members()` shows two chiefs, resolve in minutes not hours.
