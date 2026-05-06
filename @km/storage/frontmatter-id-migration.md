---
mentions:
  - km
id: "@km/storage/frontmatter-id-migration"
aliases:
  - km-storage.frontmatter-id-migration
  - km-storage-frontmatter-id-migration
created_by: claude:8b5b9e1c
created_at: 2026-04-21T20:26:49Z
closed_at: 2026-04-21T22:29:34Z
close_reason: Folded into km-storage.identity-recovery-cascade — the backfill
  migration is part of the identity package, ships together. See consolidated
  scope there.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-storage.frontmatter-id-migration
    depends_on_id: km-storage.fs-mount
    type: parent-child
    created_at: 2026-04-21T13:26:49Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-storage.fs-mount
---

# [x] Frontmatter id: backfill — one-shot migration for existing vaults @km/storage #task #P1

blocks:: [[@km/storage/fs-mount]]

One-shot background migration writing \`id: <ULID>\` into every indexed \`.md\` file's YAML frontmatter. Lives inside \`@km/fs-adapter\`.

## Why

Rank-1 recovery (identity from embedded id in frontmatter) requires files to HAVE the id: line. Existing vaults don't. Migration writes it once.

## Scope

- On first startup post-upgrade: scan all indexed files.
- For each file without \`id:\` in frontmatter: write the file's existing DB ULID into frontmatter. Preserve all other frontmatter fields + formatting.
- Idempotent — re-running is a no-op.
- Collision: if file already has \`id:\` set to a different value (e.g., from Obsidian plugin), adopt the FILE's value as authoritative + update DB.

## Migration triggers

- \`km doctor migrate-ids\` explicit command (manual trigger).
- Auto-run on first startup after upgrade — shows progress, cancelable.
- Per-file lazy option: \`KM_LAZY_FRONTMATTER_MIGRATION=1\` skips batch migration; writes \`id:\` only when a file is next edited.

## Risk

- Write amplification: touching every file. Mitigate with batched writes + atomic temp-file pattern.
- Obsidian conflict detection: if another process is editing a file, defer.
- Some users may have read-only vaults (iCloud sync lags, permissions) — migration skips with warning.

## Acceptance

- [ ] Migration command: \`bun km doctor migrate-ids\`
- [ ] Auto-trigger on first startup, progress UI
- [ ] Idempotent + safe to interrupt
- [ ] Preserves all other frontmatter fields exactly
- [ ] Conflict resolution when file has conflicting id:
- [ ] Lazy-migration opt-out
- [ ] Tests against realistic frontmatter shapes

## Depends on

- @km/storage/fs-mount (parent)
- @km/storage/markdown-fidelity-corpus (writes must not break fidelity)

## RFC reference

\`hub/km/source-of-truth-rfc-v2-addendum-identity.md\` §5.1

