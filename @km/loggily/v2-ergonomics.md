---
mentions:
  - km
  - Bjørn
id: "@km/loggily/v2-ergonomics"
aliases:
  - km-loggily.v2-ergonomics
  - km-loggily-v2-ergonomics
created_by: Bjørn Stabell
created_at: 2026-04-12T07:57:55Z
closed_at: 2026-04-12T15:20:42Z
close_reason: >-
  All 7 issues fixed:

  1. { spans: true/false } config key for per-pipeline span control

  2. "console" string accepted as alias for console literal

  3. createTestLogger(name) helper exported

  4. POJO { write: fn } works (writable check before POJO check)

  5. createLogger(name, props) backwards-compat restored

  6. Default pipeline dynamic env re-reading (already working)

  7. DRY: defaultPipeline can't fully share with buildPipeline (dynamic env),
  but inline code simplified

  248 loggily tests pass. 0 km test regressions (80 failures are silvery
  reactive pipeline, not loggily).
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-loggily.v2-ergonomics
    depends_on_id: km-loggily.api-v2
    type: parent-child
    created_at: 2026-04-12T00:58:12Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-loggily.api-v2
---

# [x] v2 API ergonomics issues (7 items) @km/loggily #bug #P0 @Bjørn Stabell

blocks:: [[@km/loggily/api-v2]]

Ergonomics issues identified during v2 implementation that need design decisions before 1.0.

1. TRACE still env-var-only — no { spans: true } in config array
2. console as literal value feels magical — consider "console" string or default output
3. Test verbosity — every test needs [{ level: "trace" }, console]; need createTestLogger helper
4. CaptureWriter needs a class — POJO with .write() rejected by discrimination; check .write() before POJO check
5. Props moved to .child() — createLogger("x", { ver: "1.0" }) no longer works
6. No runtime config for default pipeline — worked around with dynamic env var re-reading
7. DRY: defaultPipeline duplicates buildPipeline logic — should use buildPipeline([console]) internally

