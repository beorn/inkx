/**
 * `mcp:` handler — stub. Surfaces a useful pointer instead of a silent
 * failure when a rule routes through here.
 *
 * The full implementation (calling an MCP tool, formatting the result for
 * the popover) is tracked at `km-silvercode.autolinks-mcp-resolver`. After
 * the URI pivot landed (`km-silvercode.autolinks-autolinks-uri-pivot`), the
 * mcp resolver becomes a handler scheme (it lives here, not in
 * `previews.ts`).
 */

import type { Handler, HandlerOutcome, ResolveCtx } from "./index.ts"

export const mcpHandler: Handler = {
  scheme: "mcp",
  resolve(_uri: URL, ctx: ResolveCtx): HandlerOutcome {
    const t = (ctx.now ?? Date.now)()
    return {
      result: {
        kind: "error",
        message: "mcp preview not yet implemented — see km-silvercode.autolinks-mcp-resolver",
        resolvedAt: t,
      },
    }
  },
}
