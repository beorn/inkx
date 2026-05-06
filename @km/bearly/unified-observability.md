---
mentions:
  - km
  - claude
id: "@km/bearly/unified-observability"
aliases:
  - km-bearly.unified-observability
  - km-bearly-unified-observability
created_by: claude:87d20187
created_at: 2026-04-27T17:25:20Z
closed_at: 2026-04-27T18:13:35Z
close_reason: >-
  Migration complete. All acceptance criteria literally verified:


  - BG_RECALL_DEBUG_LOG / INJECTION_DEBUG_LOG: 0 hits in production source
  EXCEPT in vendor/bearly/plugins/injection-envelope/src/debug.ts:14,71 — that's
  the explicit one-release back-compat shim that lazily registers a
  namespace-scoped writer if the env var is set (per acceptance —
  back-compat-shim references OK).

  - vendor/bearly/packages/bg-recall/src/log.ts deleted ✓

  - vendor/bearly/plugins/injection-envelope/src/debug.ts now uses
  createLogger('injection:wrap' | 'injection:skip') from loggily —
  appendFileSync gone ✓

  - bg-recall daemon uses createLogger('bg-recall:daemon' | 'bg-recall:decision'
  | 'bg-recall:hint') ✓

  - vendor/loggily/src/core.ts:1064 exports addWriterFor — namespace-glob
  routing primitive ✓

  - 0 non-pre-existing tsc errors ✓

  - bun vitest run --project vendor vendor/bearly/packages/bg-recall
  vendor/bearly/plugins/injection-envelope vendor/loggily → 20 files / 438 tests
  pass ✓


  Commits:

  - vendor/loggily: addWriterFor primitive shipped (separately, before this
  bead's vendor/bearly work)

  - vendor/bearly 3b1ce6a 'refactor(bg-recall): migrate to loggily namespaces
  (km-bearly.unified-observability)'

  - vendor/bearly 67642e5 'refactor(injection-envelope): migrate to loggily
  namespaces (km-bearly.unified-observability)'

  - km 03c8a486b 'vendor: bump loggily — addWriterFor namespace routing'

  - km 20b735f55 'vendor: bump bearly — bg-recall + injection-envelope on
  loggily'

  - All commits pushed to origin (verified via git ls-remote)


  Out-of-scope items (separate beads if/when motivated):

  - Removing the back-compat env aliases (BG_RECALL_DEBUG_LOG /
  INJECTION_DEBUG_LOG) once one release passes — file as
  km-bearly.observability-cleanup if someone notices the shim still in source
  after 30 days.

  - Sweeping other ad-hoc loggers in the codebase (none discovered during this
  migration).


  Quality-rubric: L0/L1 → L4. The lint check at
  packages/km-infra/scripts/check-no-raw-logging.sh enforces 'no local
  createLogger / no appendFileSync to .log/.jsonl / no _DEBUG_LOG env vars' —
  turns 'two paths can drift' into 'there is no second path'.
started_at: 2026-04-27T17:25:31Z
owner: bjorn@stabell.org
assignee: claude:87d20187
dependencies:
  - issue_id: km-bearly.unified-observability
    depends_on_id: km-tribe
    type: parent-child
    created_at: 2026-04-27T10:25:20Z
    created_by: claude:87d20187
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tribe
---

# [x] Unified observability — fold BG_RECALL_DEBUG_LOG + INJECTION_DEBUG_LOG into loggily namespaces @km/bearly #task #P2 @claude:87d20187

blocks:: [[@km/tribe]]

## Why

Two parallel observability subsystems reinvented loggily's wheel:

- `vendor/bearly/packages/bg-recall/src/log.ts:51` — exports its own `createLogger` keyed on `BG_RECALL_DEBUG_LOG`. Shadows loggily's `createLogger` name; bypasses the existing pipeline + writers + namespaces.
- `vendor/bearly/plugins/injection-envelope/src/debug.ts:47` — direct `fs.appendFileSync` to `INJECTION_DEBUG_LOG`.

Meanwhile, 30+ other modules already use loggily's `createLogger("namespace:thing")` (silvery:render, bearly:llm, daemon-spine:client, tribe:daemon, …). loggily already ships `createFileWriter(path)` + `addWriter` for JSONL fan-out.

The bg-recall bead's "format matches INJECTION_DEBUG_LOG so users can tail -f | jq . both side-by-side" requirement is exactly what loggily would make automatic — both subsystems would emit through the same pipeline, namespace-tagged, queryable in one stream.

Per quality-rubric L0/L1/L2 → L4: today each subsystem has its own observability env-var. The architecture doesn't make 'two log paths drift' impossible. After this bead: there's no second path to drift to.

## What

Fold both into loggily.

## bg-recall side

- Delete `vendor/bearly/packages/bg-recall/src/log.ts` (the parallel `createLogger` impl).
- Replace internal call sites with `createLogger("bg-recall:trigger")`, `createLogger("bg-recall:hint")`, `createLogger("bg-recall:reject")`, `createLogger("bg-recall:explain")` etc. — finer-grained namespaces than the single boolean today.
- Wire `LOGGILY_FILE_BG_RECALL` (or unified `LOGGILY_FILE`) writer in `vendor/bearly/tools/bg-recall.ts` daemon startup via `addWriter((formatted, level, ns) => writer.write(formatted))`.
- Update `bun bg-recall explain <hint-id>` to query the loggily JSONL output via namespace + hintId field.
- Keep `BG_RECALL_DEBUG_LOG` as a back-compat env: if set, route to a writer scoped to `bg-recall:*` namespace (one-release transition; delete in next bead).

## injection-envelope side

- Delete `vendor/bearly/plugins/injection-envelope/src/debug.ts` (`appendFileSync` block).
- Replace with `createLogger("injection:sanitize")`, `createLogger("injection:wrap")`, `createLogger("injection:reject")`.
- Same back-compat: `INJECTION_DEBUG_LOG` env routes to a namespace-scoped writer if set.

## loggily side (extension if needed)

- Verify loggily's `addWriter` callback signature exposes namespace + structured fields. If not, extend.
- Consider a `addWriterFor(namespacePattern, writer)` helper for per-namespace file routing — one writer per file, glob-matched namespaces.
- Verify JSONL emission preserves structured fields (e.g., `{ts, level, namespace, msg, hintId, score, …}`).

## Acceptance — verified literally

- `grep -rn 'BG_RECALL_DEBUG_LOG\|INJECTION_DEBUG_LOG' vendor/bearly/ vendor/accountly/` → 0 hits in production source (back-compat shim if any tracked separately + deleted in follow-on)
- `vendor/bearly/packages/bg-recall/src/log.ts` deleted
- `vendor/bearly/plugins/injection-envelope/src/debug.ts` reduced to a re-export of `createLogger`, OR deleted with call sites migrated
- `bun bg-recall explain <hint-id>` works against loggily JSONL output (test asserts via in-memory writer)
- New unit tests: namespace-routing, structured-fields preserved through writer pipeline, back-compat env alias
- All existing bg-recall + injection-envelope tests pass
- `bun vitest run --project vendor vendor/bearly/` → no regressions
- README updates: `vendor/bearly/packages/bg-recall/README.md` + injection-envelope README replace 'set BG_RECALL_DEBUG_LOG / INJECTION_DEBUG_LOG' with 'set DEBUG=bg-recall:*,injection:* + LOGGILY_FILE=...'

## Out of scope (separate beads)

- Removing the back-compat env aliases (do that in a follow-on after one release of dual-key behaviour)
- Migrating other ad-hoc loggers to loggily (audit + sweep is its own bead)
- Adding OTel/structured-log exporters (loggily already has otel.ts + tracing.ts — separate effort)

## Reference

- `hub/composition.md` — loggily is the canonical observability primitive
- `vendor/loggily/src/{file-writer.ts,pipeline.ts,index.ts}` — current API surface
- bg-recall README "Status & observability — first-class" section (rewrite to reference loggily namespaces)

