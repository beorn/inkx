---
mentions:
  - km
id: "@km/infra/tribe-channel-noise-hook"
aliases:
  - km-infra.tribe-channel-noise-hook
  - km-infra-tribe-channel-noise-hook
created_by: claude:a1a0e667
created_at: 2026-04-20T23:12:53Z
closed_at: 2026-04-20T23:28:43Z
close_reason: Implemented Path A (pre-filter at MCP source).
  vendor/bearly@8b75a55 + km@<bump>. Low-signal types
  (github:push/workflow/ci-recovered, status, health:*:warning) no longer fire
  as user-turn input. Effect after MCP server restart / next session.
  TRIBE_CHANNEL_VERBOSE=1 disables filter.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.tribe-channel-noise-hook
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-20T16:13:08Z
    created_by: claude:a1a0e667
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] Tribe channel messages create empty H: turns even when assistant emits nothing — suppress at hook/daemon level @km/infra #bug #P3

blocks:: [[@km/infra]]

## Symptom

When a tribe channel message arrives (e.g., `<channel source="plugin:tribe:tribe" from="daemon" type="github:push">`), the harness:

1. Wraps it as a user-turn input
2. Fires UserPromptSubmit hook (logs 'UserPromptSubmit hook success: OK')
3. Triggers a model call
4. Even when assistant emits zero text + zero tools (per quiet-tribe-ack memory rule), the session log still shows an empty H: turn header + the channel content + the hook success line

User has flagged this 2x as ambient noise that pollutes the session view. The behavioral fix (assistant emits nothing) is in place per ~/CLAUDE.md and feedback-quiet-tribe-ack.md, but the harness still renders the empty turn.

## Investigation findings (2026-04-20 fixer session)

- Channel XML is constructed by tribe plugin: `vendor/bearly/plugins/tribe/server.mjs` (member/chief instructions describe the wrapping)
- Message delivery goes through the daemon (`vendor/bearly/plugins/tribe/lore/server.ts`) → harness MCP layer → wrapped as user-turn input
- UserPromptSubmit hook at `.claude/hooks/user-prompt-submit.sh` calls `bun vendor/bearly/tools/tribe-cli.ts hook prompt` for delta-context injection — runs on every prompt, regardless of source
- The hook can return `{hookSpecificOutput: {additionalContext: ...}}` to add context, but appears to have no `suppressPrompt` / `skipModelCall` mechanism

## Three fix paths (ordered by feasibility)

### A. Tribe plugin: side-channel injection (PREFERRED)

Modify the tribe daemon to inject channel messages into the session's CONTEXT stream rather than as a fresh user-turn prompt. The model sees them as ambient awareness on the next real turn instead of triggering a turn-per-message.

- File: `vendor/bearly/plugins/tribe/server.mjs` + daemon delivery code
- Effect: tribe messages no longer fire UserPromptSubmit; appear inline on next real prompt as `<recent-tribe>...</recent-tribe>` block
- Trade-off: messages don't surface immediately; pile up between real turns

### B. Hook-side suppress (INVESTIGATE)

If Claude Code supports `hookSpecificOutput.suppressPrompt: true` (or similar) — detect tribe-only prompts in the hook, suppress the model call entirely. Need to check Claude Code hook docs / source.

- File: `.claude/hooks/user-prompt-submit.sh`
- Effect: tribe-only prompts don't trigger the model; H: turn may still log but assistant doesn't even spin up
- Risk: assistant misses awareness if user later asks 'what happened?'

### C. UI-only filter (DEFER)

Filter empty-response turns out of the session viewer. Doesn't fix the wasted model call but cleans the user's view.

- Out of scope — requires Claude Code harness changes

## Acceptance

- [ ] One of A/B implemented and tested (channel messages still reach assistant awareness via some mechanism)
- [ ] User confirms session log no longer shows empty H: turns from tribe channels
- [ ] Existing tribe coordination still works (chief broadcasts, status updates, etc. — agents can still respond when needed)

## Related

- ~/CLAUDE.md "Communication" section (anti-pattern list)
- feedback-quiet-tribe-ack.md (assistant-side discipline)
- This is the technical companion to the discipline rule

## Cost

- Path A: ~3-4h (daemon protocol change, test against multi-session scenarios)
- Path B: ~1-2h investigation + ~1h implementation if Claude Code supports it
- Path C: not feasible without harness changes

