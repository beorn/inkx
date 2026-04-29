---
id: "@km/bearly/migrate-to-listener"
aliases:
  - km-bearly.migrate-to-listener
  - km-bearly-migrate-to-listener
created_by: claude:fa4168d9
created_at: 2026-04-23T02:38:38Z
closed_at: 2026-04-23T02:49:54Z
close_reason: Shipped in bearly faeea22 + km 56b234c97. Tribe listener at
  vendor/bearly/tools/lib/hooks/listeners/tribe.ts with 9/9 tests passing.
  Non-destructive settings.json migration preview at
  hub/km/integrations/settings-migration-preview.{json,diff} — documents 3 exact
  command replacements (PreCompact/SessionStart/SessionEnd tribe entries) with
  backup → copy-listener → apply-diff → verify → rollback instructions +
  ready-to-run jq one-liner. User's live ~/.claude/settings.json intentionally
  untouched (opt-in application per CLAUDE.md 'do not modify shared user state
  without approval' rule).
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.migrate-to-listener
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-22T19:38:38Z
    created_by: claude:fa4168d9
    metadata: "{}"
---

# [x] Migrate tribe entries in settings.json to pluggable ingest/notify @km/bearly #task #P3

blocks:: [[@km/infra]]

Rewrite existing tribe hook entries in \`~/.claude/settings.json\` to use the pluggable \`tribe hook ingest\` / \`tribe hook notify\` CLI with a tribe listener file, instead of the named \`hook session-start\` / \`hook prompt\` / \`hook session-end\` / \`hook pre-compact\` subcommands.

## Rationale

Currently tribe has named subcommands that dispatch directly to recall handlers. Those keep working (additive guarantee). But routing through the pluggable path gives unified observability, uniform middleware, and enables additional listeners to fire on the same event without settings.json edits.

## Plan

1. Write \`vendor/bearly/tools/lib/hooks/listeners/tribe.ts\` — forwards router events to the existing \`dispatchHook(event)\` function
2. Ship as an auto-registered built-in (or a template users copy)
3. Preview + dry-run a user settings.json rewrite
4. Apply on user approval (non-destructive — preserve original as \`.bak\`)

## Acceptance

- [ ] Tribe listener exists and unit-tested
- [ ] With old settings.json entries: tribe behavior unchanged
- [ ] With migrated settings.json: tribe behavior identical (verified via broadcast test)
- [ ] Rollback path documented

## Risk

Modifies user's live \`~/.claude/settings.json\` — must be reversible and opt-in.