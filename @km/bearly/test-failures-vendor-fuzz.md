---
mentions:
  - km
  - claude
id: "@km/bearly/test-failures-vendor-fuzz"
aliases:
  - km-bearly.test-failures-vendor-fuzz
  - km-bearly-test-failures-vendor-fuzz
created_by: claude:cc081a9a
created_at: 2026-04-26T23:21:39Z
closed_at: 2026-04-26T23:53:29Z
close_reason: |-
  Fixed both vendor/bearly test failures.

  Root cause (mcp-plugin): Bun 1.3.x's http.Server does NOT fire server-side
  socket close events when a keep-alive client disconnects after a completed
  response — oven-sh/bun#7716. The plugin tracked leases via http.Server's
  "connection" event + socket "close"/"error", which silently froze the
  lease counter on Bun (the lifecycle test timed out at "wait for connection
  count to drop to 0"). Refactored lease tracking to active in-flight HTTP
  responses, listening on BOTH res.on("close") AND req.on("close") — Bun
  honors the latter on streaming responses where it skips the former.
  Realistic semantics are unchanged (an MCP client with no open response
  isn't using the daemon). Test's holdRawConnection helper replaced with
  holdStreamingRequest using a new /healthz?stream=<ms> endpoint that
  returns a streaming response — exercises the lease accounting on both
  runtimes.

  Root cause (parser.test.ts): the line parser logs a warning via loggily
  when it encounters invalid JSON, which the vitest console-quiet harness
  flagged as a test failure. Wrapped the parse call with vi.spyOn to
  silence the expected warning AND assert it fired with the bad input —
  keeps the log behavior under test rather than just suppressed.

  Verification: 808/808 bearly vendor tests pass.

  Commits:
    bearly: 634b2afda
    km:     e108917bf
started_at: 2026-04-26T23:24:15Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-bearly.test-failures-vendor-fuzz
    depends_on_id: km-all.fix-sweep-vendor-fuzz
    type: parent-child
    created_at: 2026-04-26T16:22:37Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.fix-sweep-vendor-fuzz
---

# [x] [bug] vendor/bearly — 2 test failures (daemon-spine + mcp) @km/bearly #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

daemon-spine/tests/parser.test.ts:27 + mcp/tests/mcp-plugin.test.ts:152. /complete: bun vitest run --project vendor vendor/bearly/packages/daemon-spine/tests/parser.test.ts vendor/bearly/plugins/mcp/tests/mcp-plugin.test.ts → 0 failures.

