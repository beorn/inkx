---
mentions:
  - km
id: "@km/bearly/mcp-plugin-bun-keepalive"
aliases:
  - km-bearly.mcp-plugin-bun-keepalive
  - km-bearly-mcp-plugin-bun-keepalive
created_by: claude:cc081a9a
created_at: 2026-04-27T05:46:45Z
closed_at: 2026-04-27T06:20:11Z
close_reason: Split into km-bearly.bun-keepalive-url-shim +
  km-bearly.mcp-lease-tracking per pro/Kimi review (km-all.plateau-90 R3) —
  bundling created wrong unwind logic. URL.toString() shim is pure
  upstream-waiting (parent km-all.upstream-waiting); the lease-tracking refactor
  is permanent local design (request-as-lease is semantically correct on both
  Bun and Node — see commit 634b2af and mcp-plugin.ts:374-389).
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.mcp-plugin-bun-keepalive
    depends_on_id: km-all.upstream-waiting
    type: parent-child
    created_at: 2026-04-26T22:46:45Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.upstream-waiting
---

# [x] Remove URL.toString() / lease-tracking workaround when Bun #7716 lands @km/bearly #bug #P3

blocks:: [[@km/all/upstream-waiting]]

Workaround tracking. mcp-plugin currently wraps URL with toString() and uses a lease-tracking refactor because Bun 1.3.x http.Server doesn't fire close events reliably on keep-alive connections.

Upstream: https://github.com/oven-sh/bun/issues/7716
Status: open as of 2026-04-27
Last checked: 2026-04-27

Files affected by the workaround:

- vendor/bearly/plugins/mcp/mcp-plugin.ts
  - URL.toString() in: 'return new Request(url.toString(), { method, headers, body, ... })'
  - lease-tracking refactor in connection lifecycle

Unwind when upstream lands:

1. Replace 'new Request(url.toString(), ...)' with 'new Request(url, ...)' once URL works as Request input on the patched Bun version
2. Verify the lease-tracking workaround is no longer needed (close event fires) — likely keep some accounting but remove the workaround scaffolding
3. Bump Bun minimum version in package.json to the patched release
4. Run vendor/bearly tests; verify mcp-plugin tests pass without the workaround
5. Close this bead with the Bun release version that fixed it

