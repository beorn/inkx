---
id: "@km/bearly/mcp-lease-tracking"
aliases:
  - km-bearly.mcp-lease-tracking
  - km-bearly-mcp-lease-tracking
created_by: claude:cc081a9a
created_at: 2026-04-27T06:19:55Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-bearly.mcp-lease-tracking
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-26T23:20:10Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [ ] Evaluate request-as-lease model — keep as permanent design or fold into url-shim @km/bearly #feature #P4

blocks:: [[@km/bearly]]

Evaluation bead. The mcp-plugin uses a request-as-lease lifecycle model: track active in-flight HTTP responses (`activeResponses` Set) rather than raw socket connections. Originally introduced in commit 634b2af "fix(bearly/mcp): track lease at request level, not socket level" because Bun's http.Server (1.3.x) doesn't fire socket close events reliably (oven-sh/bun#7716).

## Current verdict: KEEP — permanent local design

Reading commit 634b2af and the in-file docstring (vendor/bearly/plugins/mcp/mcp-plugin.ts:374-389):

> "Realistic semantics are unchanged — an MCP client with no open response isn't actually using the daemon. Tracking at the request/response level uses signals both runtimes honor."

The Bun bug forced the choice, but the resulting model is semantically correct on Node and Bun alike. Request-level tracking matches MCP's lease semantics directly: lease == open response (quick request/response or long-running SSE), no socket-level accounting needed. Socket-level tracking conflated keep-alive connection reuse with lease activity, which is its own bug class even on Node.

## What is purely the Bun workaround vs what is permanent design

Permanent design (keep regardless of Bun fix):
- `activeResponses: Set<ServerResponse>` accounting at request level
- `res.on("close", drop)` lease-drop signal (works on both runtimes)
- `trackResponse(req, res)` model — `dispatch()` calls it once per request
- Idle-quit timer arming when `activeResponses.size === 0`

Pure Bun workaround (delete when Bun #7716 lands):
- `req.once("close", drop)` belt-and-suspenders second listener (vendor/bearly/plugins/mcp/mcp-plugin.ts:557) — only needed because Bun skips `res.on("close")` for streaming responses
- The note in `trackResponse` docstring (lines 540-556) explaining why both listeners exist

## Resolution

Most likely: this bead can be CLOSED as "no further work needed — request-as-lease is the permanent model." The only Bun-specific code is the `req.on("close")` belt; that belt removal is already covered under @km/bearly/bun-keepalive-url-shim's unwind step ("verify the lease-tracking workaround is no longer needed").

If reviewer disagrees and considers request-level tracking only acceptable under Bun — fold this bead into @km/bearly/bun-keepalive-url-shim as part of the unwind work.

## Action

Either:
1. Close as "request-as-lease confirmed permanent — no further work" once a maintainer signs off, OR
2. Convert into a small documentation task: add a paragraph to plugins/mcp/README.md explaining that request-as-lease is intentional and permanent, distinct from the Bun bug

## Cross-refs

- Sibling (split from same source bead): @km/bearly/bun-keepalive-url-shim (covers the URL shim AND the `req.on("close")` belt unwind)
- Source split: @km/all/plateau-90 R3
- Original bead (closed): @km/bearly/mcp-plugin-bun-keepalive
- Source commit: 634b2af "fix(bearly/mcp): track lease at request level, not socket level"