# The Hook That Silently Lost Work

**TL;DR**: Any hook that produces durable side effects must be paired with a cheap, idempotent catchup on a frequent trigger. Hooks fail — crashes, schema churn, missing dependencies — and fire-and-forget state loss is invisible until you notice it months later.

---

## What Happened

The `recall` tool writes a markdown transcript to `~/Bear/Vault/raw/chats/` via a `SessionEnd` hook so qmd can index past sessions as searchable context. Initial wiring treated the hook as the single source of truth: when a session ends, the hook fires, the file gets written, qmd picks it up on the next `qmd update`. Simple.

Then Claude Code's hook JSON validator tightened to reject `{"hookSpecificOutput": {"hookEventName": "SessionEnd"}}` — the envelope the hook had been emitting. Every SessionEnd hook started failing with `Hook JSON output validation failed — (root): Invalid input`. The hook output was now wrong; the write never happened.

The silent part: the schema error only surfaced in a user-facing warning at the end of each session. Nothing tracked which sessions were exported vs. missed. Nothing reconciled the exported-markdown set against the JSONL source of truth. Missing exports accumulated invisibly — the search index just had fewer results, and there was no way to tell whether that was correct or a bug.

When the schema was fixed, the hook started working again — but the sessions that failed while it was broken were permanently missing from the index. They would have stayed missing forever without an explicit rebuild.

---

## The Causal Chain

1. **Hook treated as authoritative write path.** The design assumed "SessionEnd hook runs → file exists." There was no check that the file actually made it to disk. The hook was a one-shot with no confirmation loop.

2. **No idempotency guarantee on the frequent trigger.** The hook only fired on SessionEnd, which happens once per session. If it failed, the next chance to write that session's markdown was never.

3. **Schema change broke the output envelope.** The validator upstream tightened to reject `hookSpecificOutput` on events that don't have an event-specific schema. Claude Code's behavior changed; the hook didn't.

4. **Errors were invisible until cumulative damage became obvious.** The hook's failure produced a warning at session end, but nothing surfaced the cumulative "N sessions never got exported" state. A user noticed the prompt-injection wrapper working weirdly and pulled the thread.

---

## Rules

### 1. Pair every durable-side-effect hook with an idempotent catchup

If a hook produces a file, a row in a database, a cache entry, or any persistent state, pair it with a catchup command that reconciles the expected state against the actual state and fills in anything missing. The catchup must be idempotent (running it twice is a no-op when there's nothing to do) and cheap (scanning for missing work takes milliseconds, not seconds). Wire it into a frequently-fired trigger like SessionStart.

```typescript
// SessionEnd hook: best-effort immediate export
recall export --hook
// SessionStart hook: catchup safety net, runs on every session
recall export --catchup --hook
```

After that pattern, any SessionEnd failure loses at most one session's markdown, and the loss is repaired automatically on the next session start.

### 2. The catchup trigger should be more frequent than the work

SessionStart fires more often than SessionEnd (every new session vs. only cleanly-ended sessions). That asymmetry is the point: catchup rides a trigger that fires even when the primary hook didn't, so gaps in the primary hook's coverage get reconciled quickly.

Generalizing: if the primary hook runs on event A and you catch up on event B, `freq(B) ≥ freq(A)` and B must fire under conditions where A might have been skipped.

### 3. Catchup must be silent on the happy path

If catchup emits stderr noise every time it finds nothing to do, users turn it off or stop reading the output. Noise during normal operation destroys the signal-to-noise ratio on actual failures. Target: zero output when there's nothing to catch up; log to stderr only when work was done. Log contents should be actionable ("exported N missing sessions; triggered qmd update").

### 4. Fire-and-forget downstream reindexing

When catchup writes new data that other subsystems need to pick up (like qmd needing to reindex), trigger those downstream updates as a detached background process. Don't block the session start waiting for indexing — the user is trying to work. The detached process either succeeds (next search sees the new data) or fails (catchup writes it again next session start, gets tried again).

### 5. Idempotency is the invariant — protect it with a test

The catchup's correctness relies on "running it twice is the same as running it once." Regression here is silently destructive: if someone adds a `force: true` deep in the logic, catchup starts rewriting existing files on every session start, stomping live state. Add a test: run catchup twice in a row against a fixture, assert the second run is a no-op.

---

## See Also

- [Fail Loud, Fail Now](../principles.md#principle-fail-loud-fail-now) — the complement: catch bugs at the call site, not in production
- [Reproduce First](reproduce-first.md) — why the hook's silent failure survived so long (no one reproduced "what should be in raw/chats/")
- `vendor/accountly/src/recall.ts` — the catchup implementation
- `vendor/accountly/tests/recall.test.ts` — regression guards for the hook JSON envelope
