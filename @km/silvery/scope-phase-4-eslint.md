---
mentions:
  - km
id: "@km/silvery/scope-phase-4-eslint"
aliases:
  - km-silvery.scope-phase-4-eslint
  - km-silvery-scope-phase-4-eslint
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:40:42Z
closed_at: 2026-04-24T22:41:43Z
close_reason: "Shipped: check-no-raw-lifecycle.sh in km 1f317889a
  (baseline-guard lint, wired into test:ci) + SILVERY_SCOPE_TRACE leak detector
  in silvery 2b0880ef (40 tests pass). Together they close the front and back
  gates per /big plateau analysis."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.scope-phase-4-eslint
    depends_on_id: km-silvery.scope-phase-4
    type: parent-child
    created_at: 2026-04-24T13:40:42Z
    created_by: claude:2aefb4b6
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.scope-phase-4
---

# [x] Phase 4.A: ESLint no-raw-lifecycle rule + CI gate @km/silvery #task #P1

blocks:: [[@km/silvery/scope-phase-4]]

Add ESLint rule banning raw setTimeout, setInterval, new AbortController, child_process.spawn/fork/exec, fs.watch, fs.createReadStream/WriteStream, net.createServer, http.createServer, naked EventEmitter.on in apps/* + packages/*. Exempt @silvery/* + vendor/*. Wire into CI (bun run lint fails on violation). Exit: bun run lint clean.

