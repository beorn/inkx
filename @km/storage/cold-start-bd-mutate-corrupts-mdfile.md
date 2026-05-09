---
aliases:
  - km-storage.cold-start-bd-mutate-corrupts-mdfile
  - km-storage-cold-start-bd-mutate-corrupts-mdfile
created_at: 2026-05-09T01:22:11.537Z
tags:
  - P0
  - bug
---

# cold-start `bd close|drop|claim` corrupts .md (lost H1, _stub:true, no marker) #bug #P0

## Symptom

Cold-start `bd close|drop|claim` (no prior `km sync`) corrupts the source `.md` file:

- H1 heading is removed
- Body text reduced to whatever isn't H1 (often near-empty)
- Frontmatter gains `_stub: true`
- Task marker (`[ ]` / `[x]` / `[/]`) is dropped

The DB still records `task_status=done|dropped|wip`, but the FS is now degenerate. A follow-up `createRepo({loadFiles:true})` re-reads the broken FS and reports `status=todo` (default for a node with no marker), so the lifecycle effect appears to revert.

## Repro

```bash
REPO=$(mktemp -d)
mkdir -p "$REPO/.km" "$REPO/@km/p99"
cat > "$REPO/.km/config.yaml" <<YAML
beads:
  prefix: km
  roots: ["@km"]
  default_scope: inbox
YAML
cat > "$REPO/@km/p99/a.md" <<MD
---
type: task
priority: P2
---

# Task a #task #P2

Body text for a.
MD
cd "$REPO"
bun km bd close @km/p99/a --reason "wave6-pin"
cat "$REPO/@km/p99/a.md"
```

Observed:

```
---
type: task
priority: P2
_stub: true
closed_at: 2026-05-09T01:20:56.795Z
closeReason: wave6-pin
---

Body text for a.
```

Expected: H1 preserved with `[x]` marker, no `_stub` field, frontmatter additive only:

```
---
type: task
priority: P2
closed_at: ...
closeReason: wave6-pin
---

# [x] Task a #task #P2

Body text for a.
```

## Workaround

`km sync` before any `bd close|drop|claim` (warms full parse, avoids the stub path). The same shape of repro WITH `km sync` first round-trips correctly.

## Acceptance

- Cold-start `bd close|drop|claim` does not introduce `_stub: true` and does not delete the H1 / body.
- Round-trip `bd close → createRepo({loadFiles:true}) → resolveNode(...).item.task.status` returns `done` (not `todo`).
- These failing tests now green:
  - `apps/km-cli/tests/bd-task-equivalence.property.test.ts:379` — close
  - `apps/km-cli/tests/bd-task-equivalence.property.test.ts:395` — drop
  - `apps/km-cli/tests/bd-task-equivalence.property.test.ts:408` — claim
  - `apps/km-cli/tests/bulk-action-handlers.test.ts:147` — `--where status:wip`
  - `apps/km-cli/tests/bulk-action-handlers.test.ts:212` — reopen multiple
  - `apps/km-cli/tests/agent-spawn.test.ts:208` — cross-actor steal (same FS-clobber wipes the pre-claim state, which lets a second-actor `repo.tryClaim` CAS succeed against `assigned_to IS NULL` after the wipe)

## Suspect

Collapse-parse stub feature `e2f3eee33 feat(km-storage): collapse-parse rule — opaque mdfile stubs for designated paths` plus the partial fix in `a78ade265 fix(fs-mount): scope BulkSync.toFs writeback — skip stubs and no-op writes`. The writeback skip-stub gate doesn't catch the cold-start path that lazy-loads via the stub parser, then mutates and writes back: the on-disk file gets re-serialized in stub form (frontmatter only, no H1, no body).

Diagnosed during chief's `test:fast` triage assignment; diagnosis only, no fix attempted in this bead.

