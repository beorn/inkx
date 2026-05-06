---
mentions:
  - km
id: "@km/bearly/bun-keepalive-url-shim"
aliases:
  - km-bearly.bun-keepalive-url-shim
  - km-bearly-bun-keepalive-url-shim
created_by: claude:cc081a9a
created_at: 2026-04-27T06:19:09Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.bun-keepalive-url-shim
    depends_on_id: km-all.upstream-waiting
    type: parent-child
    created_at: 2026-04-28T08:04:37Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.upstream-waiting
---

# [ ] Unwind URL.toString() Request shim when Bun #7716 lands @km/bearly #bug #P3

blocks:: [[@km/all/upstream-waiting]]

Pure upstream-waiting shim. mcp-plugin currently wraps the URL with toString() in the Request constructor because Bun's TypeScript types reject `new Request(url, ...)` with a URL object on Bun 1.3.x.

Upstream: https://github.com/oven-sh/bun/issues/7716
Status: filed-upstream as of 2026-04-27
Last checked: 2026-04-27
Escalate by: 2026-10-27

## File affected (URL workaround only)

- vendor/bearly/plugins/shared-mcp/mcp-plugin.ts
  - URL.toString() in: `return new Request(url.toString(), { method, headers, body, ... })` (line ~151 in toWebRequest)
  - Source commit: b656d56 "fix(mcp-plugin): URL.toString() for Request constructor (tsc fix)"

## Unwind when upstream lands

1. Replace `new Request(url.toString(), ...)` with `new Request(url, ...)` in toWebRequest
2. Bump Bun minimum version in vendor/bearly/package.json to the patched release
3. Run vendor/bearly mcp-plugin tests; verify they pass without the workaround
4. Close this bead with the Bun release version that fixed it (only when Status = adopted-locally)

## Scope

This bead is ONLY the URL shim. The lease-tracking refactor in mcp-plugin (which was originally bundled with this) is tracked separately as @km/bearly/mcp-lease-tracking — that work is permanent local design hygiene independent of the Bun bug.

## Cross-refs

- Parent registry: @km/all/upstream-waiting
- Sibling (split from same source bead): @km/bearly/mcp-lease-tracking
- Source split: @km/all/plateau-90 R3 (pro/Kimi review noted that bundling URL shim with lease-tracking refactor created wrong unwind logic)
- Original bead (closed): @km/bearly/mcp-plugin-bun-keepalive

