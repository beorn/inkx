---
id: "@km/infra/hook-router"
aliases:
  - km-infra.hook-router
  - km-infra-hook-router
created_by: claude:fa4168d9
created_at: 2026-04-23T01:20:17Z
closed_at: 2026-04-23T02:50:09Z
close_reason: >-
  All phases + all 3 follow-up beads complete. Hook router lives correctly in
  bearly (not km-hooks as initially mis-shipped). /big audit caught the
  misplacement; /refactor workflow drove the correction. Summary of what
  shipped:


  BEARLY (vendor/bearly/tools/lib/hooks/ + tribe-cli.ts):

  - Pluggable dispatch router (runIngest/runNotify, 5s/100ms timeouts, listener
  registry, error isolation)

  - tribe hook ingest / tribe hook notify CLI subcommands (additive — existing
  named subcommands unchanged)

  - kanban-bridge listener (km → Cline Kanban board integration)

  - example.ts listener template

  - tribe.ts listener (for migrate-to-listener path)

  - 29/29 tests pass (10 router + 10 kanban-bridge + 9 tribe)


  KM:

  - docs/design/hook-router.md — design doc (bearly home)

  - .claude/skills/claude-config/hooks.md — listener authoring skill doc

  - hub/km/integrations/kanban-bridge.md — km↔kanban strategy

  - hub/km/integrations/settings-migration-preview.{json,diff} — opt-in
  migration artifacts

  - hub/silvery/competitive/{README,cline-kanban,ink-fork-analysis}.md —
  landscape context


  COMMITS (chronological):

  - 10c95617d feat(km-hooks): ... (REVERTED — mis-placed)

  - 35088d5ae refactor(hooks): move router into bearly (correct home)

  - bearly a837afb feat(hooks): pluggable dispatch router

  - 4f9edbd67 feat(hooks): authoring docs + kanban-bridge + example template

  - bearly ca6b56d feat(hooks): kanban-bridge + example

  - 56b234c97 feat(hooks): tribe listener + settings.json migration preview

  - bearly faeea22 feat(hooks): tribe listener for pluggable dispatch path


  Followups all closed: km-bearly.kanban-runtime, km-bearly.listener-docs,
  km-bearly.migrate-to-listener.


  Future work (not bead-tracked — user-side or opportunistic):

  - User applying the settings.json migration preview when ready

  - Per-agent adapters for Codex/Gemini/OpenCode if concrete consumers emerge

  - Daemon mode (v2) if cross-event state becomes concretely needed


  Lesson encoded at memory/feedback-bearly-owns-claude-hooks.md.
owner: bjorn@stabell.org
assignee: claude:fa4168d9
dependencies:
  - issue_id: km-infra.hook-router
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-22T18:20:31Z
    created_by: claude:fa4168d9
    metadata: "{}"
---

# [x] Unified hook dispatch (kanban-style) for km integrations @km/infra #feature #P3 @claude:fa4168d9

blocks:: [[@km/infra]]

## Problem

Claude Code integrations (recall, tribe, bead-prime, cmux, future: kanban-bridge, GitHub-event-forward, etc.) each wire their own entries in `~/.claude/settings.json`. Consequences:

- **settings.json sprawl** — multiple integrations on the same event = multiple shell commands queued.
- **Implicit contracts** — each hook script makes its own assumptions about stdin/env/args. No shared vocabulary.
- **No testability** — hook behavior only observable by running Claude Code with side effects.
- **No shared middleware** — timeouts, logging, debug flags, rate limiting reimplemented or missing per integration.
- **Brittle onboarding** — adding a new integration means updating ~7 settings.json entries; forgetting one silently breaks that event.

## Solution (shipped in bearly)

Pluggable dispatch router + normalized event vocabulary + listener registry. **Lives in bearly**, not km — bearly owns Claude Code hook coordination infrastructure (tribe, recall, autostart, tools/lib/tribe/hook-dispatch.ts). Exposed via `tribe hook ingest` / `tribe hook notify` subcommands alongside existing `tribe hook session-start` / `session-end` / `prompt` / `pre-compact` named subcommands (additive, no migration of existing integrations required).

### Event vocabulary (source-agnostic)

session_start, session_end, user_prompt_submit, pre_tool_use, post_tool_use, post_tool_use_failure, stop, subagent_stop, notification, permission_request

### CLI surface

```
tribe hook ingest --event <event> --source <source> [flags]   # synchronous, 5s per-listener timeout
tribe hook notify --event <event> --source <source> [flags]   # best-effort, 100ms timeout, never throws
```

Both exit 0 always (non-zero from a Claude Code hook can block the session). Listener failures isolated, do not cascade.

Enrichment flags: `--activity-text`, `--tool-name`, `--final-message`, `--hook-event-name`, `--notification-type`, `--metadata-base64`, `--project-path`, `--session-id`.

### Listener registry

Listeners live in `~/.claude/hooks.d/` (user-level) and `<project>/.claude/hooks.d/` (project-local). TS modules that default-export `defineListener({...})` or a plain object `{ name, events?, sources?, timeoutMs?, handle(ctx) }`. Adding a new integration = drop a file; no settings.json edit.

## Source

- `vendor/bearly/tools/lib/hooks/{types,router,loader,index,hooks.test}.ts`
- `vendor/bearly/tools/tribe-cli.ts` — `hook ingest` + `hook notify` subcommands (addPluggableHookFlags helper, around line 618)
- km consumer docs: `docs/design/hook-router.md`
- km↔kanban integration strategy: `hub/km/integrations/kanban-bridge.md`

## History

Original Phase 1 landed as `packages/km-hooks/` in km commit `10c95617d` (2026-04-23). During the post-ship /big audit, bearly was discovered to already own the hook-dispatch territory. Commit `35088d5ae` removed the @km/_orphan/side package; commit `a837afb` in bearly contains the correct implementation. Full /refactor phase plan + literal /complete verification in the notes below.

## Remaining work (separate follow-up beads)

- `km-bearly.migrate-to-listener` — migrate existing `~/.claude/settings.json` tribe hook entries from named subcommands to pluggable `ingest`/`notify` with listener files for recall, tribe, bd-prime, cmux.
- `km-bearly.kanban-runtime` — kanban-bridge listener forwarding to `kanban hooks notify`.
- Listener docs + templates.

This bead tracks the router-reshape scope only (completed). Migration work is additive and opt-in, tracked separately.