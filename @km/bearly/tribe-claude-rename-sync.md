---
mentions:
  - km
id: "@km/bearly/tribe-claude-rename-sync"
aliases:
  - km-bearly.tribe-claude-rename-sync
  - km-bearly-tribe-claude-rename-sync
created_by: claude:8b5b9e1c
created_at: 2026-04-21T20:38:19Z
closed_at: 2026-04-21T21:02:15Z
close_reason: "Parked per dual-model review (Gemini 3 Pro + K2.6): F2-A polling
  is technically non-functional — process.env is immutable after process start,
  a tribe-proxy child can't see updates to CLAUDE_SESSION_NAME from its Claude
  parent. Need either a SessionRename hook in Claude Code (doesn't exist today)
  or a custom /rename skill that calls tribe.rename directly. Re-file if
  Anthropic adds the hook or user wants the custom skill."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.tribe-claude-rename-sync
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-21T13:38:18Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-bearly
---

# [x] Tribe: auto-sync tribe name when Claude /rename fires @km/bearly #feature #P2

blocks:: [[@km/bearly]]

User wants: "I'd like for tribe names to automatically be synced with session names (if I do a /rename)."

## Current state

Claude Code's /rename updates CLAUDE_SESSION_NAME in the session's process env. Tribe daemon reads CLAUDE_SESSION_NAME once on tribe.join (resolveName step 2, tribe-daemon.ts:445). Mid-session /rename is invisible to tribe until next reconnect.

## Three approaches (pick one)

### Option A — Poll-based (lowest friction)

Tribe-proxy forwards the current CLAUDE_SESSION_NAME on every heartbeat/ping. Daemon diff-checks against the stored name and auto-renames if changed.

- Pros: No Claude Code changes needed. Works today. Catches /rename within one heartbeat interval.
- Cons: Small per-heartbeat overhead. Doesn't fire immediately.

### Option B — Hook-based (cleanest if Claude Code supports it)

Register a Claude Code hook that fires on /rename:

```bash
# .claude/hooks/session-rename.sh
bun "$REPO_ROOT/vendor/bearly/tools/tribe-cli.ts" rename "$CLAUDE_SESSION_NAME"
```

- Pros: Instant. Zero polling cost.
- Cons: Requires Claude Code to emit a SessionRename event/hook. May not exist today — investigate. If it does exist, this is the right answer.

### Option C — Update the /rename skill (most targeted)

The km /rename skill already runs when user invokes it. Update it to ALSO call tribe.rename() as part of the skill:

```markdown
# .claude/skills/rename/SKILL.md
1. Rename the Claude session (existing behavior)
2. Call tribe.rename with the same name
3. Log success
```

- Pros: Direct. Only runs when user invokes /rename. Easy to test.
- Cons: Only catches /rename invocations through the skill, not other ways the session might be renamed (e.g., direct MCP call, CLI flag, etc.). Also requires the skill to know about tribe, which is a dependency coupling.

## Recommendation

Investigate Option B first — check if Claude Code has a SessionRename hook event (grep .claude/hooks/ docs, check claude-code docs). If it exists, ship it. If it doesn't, ship Option A (poll) — simpler than C and covers all rename paths. File Option B as a Claude Code feature request separately.

## Acceptance

- [ ] One of A/B/C lands
- [ ] Test: invoke Claude /rename mid-session → within 30s (or immediately for B/C) tribe.members shows new name
- [ ] Feedback memory captures the right pattern for other multi-process name sync cases

## References

- vendor/bearly/tools/tribe-daemon.ts:445 (CLAUDE_SESSION_NAME read)
- vendor/bearly/plugins/tribe/server.mjs:2062 (register payload)
- Claude Code hook docs (investigate)

## Related

- @km/bearly/tribe-session-resume (session resume across Claude invocations)

