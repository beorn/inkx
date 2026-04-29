---
id: "@km/loggily/v2-phase4"
aliases:
  - km-loggily.v2-phase4
  - km-loggily-v2-phase4
created_by: Bjørn Stabell
created_at: 2026-04-12T06:58:54Z
closed_at: 2026-04-12T08:01:10Z
close_reason: 17 doc files updated for v2 API. All examples use config arrays.
  Comparison.md rewritten per positioning rules. Migration guides updated. 248
  tests pass.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-loggily.v2-phase4
    depends_on_id: km-loggily.api-v2
    type: parent-child
    created_at: 2026-04-11T23:58:54Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-loggily.v2-phase4
    depends_on_id: km-loggily.v2-phase3
    type: blocks
    created_at: 2026-04-11T23:59:04Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Phase 4: advanced features — OTEL, worker, rotation, metrics @km/loggily #task #P3 @Bjørn Stabell

blocks:: [[@km/loggily/api-v2]], [[@km/loggily/v2-phase3]]

Implement deferred features: OTEL bridge (loggily/otel), worker forwarding (loggily/worker v2), file rotation (loggily/rotation), metrics in default compose, redaction plugin. Each is a subpath module.

Additionally: systematic and thorough update of ALL loggily docs to reflect v2 API:
- README.md — rewrite opening, examples, quick-start to use v2 API (createLogger with arrays, objects-as-config, no pipe/filter imports)
- docs/guide/ — update every guide page for v2 patterns (arrays branch, objects configure, values write)
- docs/api/ — regenerate API reference for v2 types (LogEvent, SpanEvent, Stage signature, createLogger overloads)
- CHANGELOG.md — document breaking changes, migration path
- Migration guide — v1→v2 side-by-side comparison for every API
- Remove or redirect all references to deprecated v1 globals (setLogLevel, addWriter, enableSpans, etc.)
- Ensure all examples use log.info?.() style consistently
- Update all code samples to use ns (not name) for namespace filters
- Verify no docs reference removed helpers (byLevel, byNamespace, toFile, toConsole, filter, pipe)
- Add discrimination rules to API docs (object=config, array=branch, value=output)
- Update VitePress sidebar/navigation to match new structure
- Audit docs/ for any stale references to v1 architecture