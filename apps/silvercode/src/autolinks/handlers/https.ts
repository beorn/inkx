/**
 * `https:` handler — generic webcard placeholder for plain URLs.
 *
 * v1 doesn't fetch the URL (that needs offline-safe fetching, OG metadata
 * extraction, sandboxing) — instead we surface a structured placeholder so
 * users see the URL details up front. Plain URLs detected in messages flow
 * through this handler via virtual rules emitted by `match.ts`. There is no
 * longer a builtin `kind: "url"` detection in `detection.ts`; this handler
 * is the sole rendering path for plain URLs (see
 * `bd-km-silvercode.url-detection-via-handlers`).
 *
 * Future: replace the placeholder body with a webcard fetch. Tracking via
 * `km-silvercode.autolinks-uri-pivot` follow-up.
 */

import type { Handler, HandlerOutcome, ResolveCtx } from "./index.ts"

export const httpsHandler: Handler = {
  scheme: "https",
  resolve(uri: URL, ctx: ResolveCtx): HandlerOutcome {
    return webcardOutcome(uri, ctx)
  },
}

/**
 * Sibling for `http:` URIs — same body shape as `https:` since the popover
 * rendering doesn't differ. Registered separately in `index.ts` only if a
 * caller passes an `http:` URI; v1 keeps the registry minimal so `http:` is
 * NOT pre-registered and falls through to the unhandled-scheme path. (When
 * we add it, we just register `httpHandler` next to `httpsHandler`.)
 */
export const httpHandler: Handler = {
  scheme: "http",
  resolve(uri: URL, ctx: ResolveCtx): HandlerOutcome {
    return webcardOutcome(uri, ctx)
  },
}

function webcardOutcome(uri: URL, ctx: ResolveCtx): HandlerOutcome {
  const t = (ctx.now ?? Date.now)()
  const lines: string[] = []
  lines.push(uri.toString())
  if (uri.host.length > 0) {
    lines.push("")
    lines.push(`host: ${uri.host}`)
  }
  if (uri.pathname.length > 1) {
    lines.push(`path: ${uri.pathname}`)
  }
  lines.push("")
  lines.push("(webcard fetch not yet implemented — open in a browser to view)")
  return {
    result: { kind: "ok", body: lines.join("\n"), format: "text", resolvedAt: t },
  }
}
