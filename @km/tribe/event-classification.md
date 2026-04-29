---
id: "@km/tribe/event-classification"
aliases:
  - km-tribe.event-classification
  - km-tribe-event-classification
created_by: claude:632692f2
created_at: 2026-04-20T20:17:53Z
closed_at: 2026-04-27T08:24:58Z
close_reason: "Landed via tribe-refactor team (compose, qualgate, bgrecall,
  events agents in parallel worktrees). All acceptance criteria verified: bearly
  tests 983/983 pass, 0 non-vendor non-silvery-WIP tsc errors. Bearly tip
  655f11a; km integration commit 5de018cf7 (already on origin/main per
  parallel-session merge). Companion km commits: 34f07d080 (qualgate accountly
  export-path gate), a0c9bfb5b (compose hub doc cleanup), f4e8fac6a (bgrecall
  worktree commit, integrated). See km-tribe.refactor for epic close +
  integration details."
started_at: 2026-04-27T07:27:23Z
owner: bjorn@stabell.org
assignee: claude:87d20187
dependencies:
  - issue_id: km-tribe.event-classification
    depends_on_id: km-tribe.refactor
    type: parent-child
    created_at: 2026-04-27T00:17:30Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Tribe event classification: actionable vs ambient delivery filter @km/tribe #feature #P2 @claude:87d20187

blocks:: [[@km/tribe/refactor]]

# Problem

When many tribe plugins fire (commits, pushes, joins/leaves, git-lock warnings, CI alerts, health warnings), every broadcast lands as an MCP channel message. Claude Code renders these as `Human:` turns; the turn-taking reflex drives the agent to respond — even when there's nothing to say. Result: ack-spam like "Acknowledged — still waiting…" for 80+ messages in a row (session 2026-04-19, pro review `/tmp/llm-632692f2-full-session-retrospective-review-the-ull4.txt`).

Memories and CLAUDE.md rules help marginally but lose against live-context pattern completion. **If a rule matters, promote it from memory to mechanism.**

# Proposal

Tag every tribe plugin event with a **kind**:
- **actionable** — agent needs or likely needs to react (DMs, queries, requests, CI alerts for the session's repos, blocker notifications)
- **ambient** — informational only (commits, pushes, joins/leaves, git-lock warnings, unrelated CI, health warnings below escalation)

Daemon delivers only **actionable** down the MCP channel. **Ambient** events accumulate in a per-session inbox the agent pulls when it wants context (on resume, before commits, during `/sop`).

## Protocol delta

1. Events carry `kind: "actionable" | "ambient"` at emit time. Default = `actionable` (back-compat for unmigrated plugins).
2. Daemon routes: `actionable` → channel + inbox; `ambient` → inbox only.
3. New tool `tribe.inbox({since?, kinds?, limit?})` — returns pending queue, advances read cursor.
4. New tool `tribe.mode({mode: "focus" | "normal" | "ambient"})` — session-level filter applied AFTER kind classification:
   - `focus` = only direct DMs and threshold-escalated alerts
   - `normal` = current kind-based default
   - `ambient` = everything to channel (escape hatch)

## Default classifications (configurable per plugin)

- `git:commit` / `git:push` → ambient
- `session:join` / `session:leave` → ambient
- `session:direct-message` → actionable
- `health:git-lock` warning → ambient; (escalated >60s) → actionable
- `health:cpu` / `health:daemon` warning → ambient; critical → actionable
- `github:workflow:FAILED` → actionable for repo the session works in (cwd heuristic), ambient otherwise
- `github:ci-alert` / `ci-recovered` → same rule
- `notify` from members → actionable unless `type=status` → ambient
- `query` / `request` / `verdict` / `assign` → actionable
- `status` / `response` → ambient unless explicitly addressed (`to=me`)

## File pointers

- `vendor/bearly/tools/tribe-proxy.ts` — MCP proxy (adds `tribe.inbox`, `tribe.mode`, plus dismiss/snooze tools — see notes)
- `vendor/bearly/tools/tribe-daemon.ts` — event router (classification + queue)
- `vendor/bearly/plugins/tribe/plugins/*.ts` — each plugin declares kind per event type
- `vendor/bearly/plugins/tribe/server.mjs` — regenerated via `bun run build`
- Daemon wire-protocol bump: v4 → v5

## Acceptance

- New tool `tribe.inbox` returns pending events since cursor; advances cursor on call
- New tool `tribe.mode` persists per-session; filter applied at daemon before channel delivery
- `responseExpected: "yes" | "optional" | "no"` attribute on every `<channel>` envelope (see notes)
- `tribe.dismiss` and `tribe.snooze` shipped (see notes)
- Each built-in plugin declares kind per event (no implicit defaults once classified)
- Backward-compat: a plugin without kinds still works (defaults to `actionable`)
- Existing tests green; new tests for classification + cursor + focus mode + snooze auto-revert
- `bun vendor/bearly/plugins/tribe/server.mjs` rebuild passes `tribe.doctor`
- Bump `@bearly/tribe` minor (0.11.x → 0.12.0) — protocol-level change

# Rollout

1. Add classification field to event emit protocol; all plugins default to `actionable` (no behavioral change)
2. Classify built-in plugin events per table (broadcasts drop substantially)
3. Ship `tribe.inbox` + `tribe.mode`
4. Ship `tribe.dismiss` + `tribe.snooze` + `responseExpected` envelope attribute
5. Update user docs + `tribe.doctor` to surface mode/snooze
6. Publish @bearly/tribe 0.12.0

# Out of scope

- Claude Code hooks (output-side suppressors) — brittle, doesn't save tokens
- Changing `<channel>` XML rendering — tool owns transport
- LLM-based classification — keep deterministic per plugin

# Reference

Pro review 2026-04-20 (`/tmp/llm-632692f2-full-session-retrospective-review-the-ull4.txt`). Motivated by ~80 consecutive ambient tribe events producing 80 useless "Acknowledged" turns.

See DESIGN field for Matrix-shape portability mapping. See NOTES for storage model + LLM-side dismiss/snooze affordances.