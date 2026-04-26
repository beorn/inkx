/**
 * Autolink handler registry.
 *
 * The autolinks pivot factors preview resolution into URI-scheme dispatch:
 * a handler is a `(URL → PreviewResult)` function keyed by URI scheme. Stage 1
 * (linkifier in `match.ts`) matches text and produces a URI via
 * `parseResolvesTo`; stage 2 (this module) dispatches the URI to the matching
 * handler.
 *
 * v1 ships a hardcoded registry — five built-in schemes: `file`, `bd`,
 * `shell`, `https`, `mcp`. v2 will expose `[[handlers]]` in `.km/config.yaml`
 * for user-defined handlers (deferred — tracked by future bead).
 *
 * `resolveURI` is the entry point. Internally it picks a handler and routes
 * the URI through it. The user-facing schema in `config.ts` still carries a
 * `preview` kind (the user's stated intent — "show me the readme") which the
 * file/bd/shell/mcp handlers consume as a hint. https has no rule-side
 * `preview` because plain URLs in messages flow through this pipeline as
 * virtual rules (see `match.ts`).
 */

import type { AutolinkPreviewKind } from "../config.ts"
import type { PreviewResult } from "../previews.ts"
import { fileHandler } from "./file.ts"
import { bdHandler } from "./bd.ts"
import { shellHandler } from "./shell.ts"
import { httpsHandler, HTTPS_HOST_PARSERS, type HttpsHostParser } from "./https.ts"
import { mcpHandler } from "./mcp.ts"

/**
 * Outcome returned by a handler. The body is a `PreviewResult` (the popover
 * payload); `watchPath` is an optional filesystem path the cache should
 * `fs.watch` for invalidation. Non-file-backed handlers omit `watchPath` and
 * the cache layer falls back to the 30s TTL.
 */
export type HandlerOutcome = {
  readonly result: PreviewResult
  readonly watchPath?: string
}

/**
 * Context passed to a handler when resolving a URI. Carries the data
 * handlers need that can't be packed into the URL itself (shell command
 * spec, the user's stated `preview` intent, time injection for tests, etc).
 */
export type ResolveCtx = {
  /** Stable cache key — derived from rule + matched text upstream. */
  readonly cacheKey: string
  /**
   * The user's stated `preview` intent from the source rule. Handlers use
   * this as a hint when their scheme supports multiple modes (e.g. `file:`
   * supports `readme` and `first-paragraph`). Optional — virtual rules for
   * plain URLs in messages have no rule-side preview.
   */
  readonly preview?: AutolinkPreviewKind
  /** Shell command spec — required when routing through the `shell` handler. */
  readonly command?: { readonly exec: string; readonly args: readonly string[] }
  /** Override `now()` for tests; production callers omit. */
  readonly now?: () => number
}

/**
 * A handler resolves a URI of a given scheme into a `PreviewResult`.
 *
 * Handlers are pure with respect to their inputs — they MAY perform IO
 * (filesystem, subprocess) but never mutate global state. Caching, watcher
 * lifecycle, and TTL fallback are owned by `resolvePreview` in `previews.ts`,
 * not by the handler.
 *
 * The `hosts` field is reserved for future use (e.g. `mcp://<server>/<tool>`
 * could route by host). v1 doesn't dispatch on host — scheme is sufficient.
 */
export type Handler = {
  /** URI scheme this handler claims (without trailing colon, e.g. `file`). */
  readonly scheme: string
  /** Optional host filter — when set, only matches URIs whose host is in the list. */
  readonly hosts?: readonly string[]
  /**
   * Resolve the URI synchronously. Caching/watcher lifecycle is handled
   * upstream in `resolvePreview`; the handler's only job is the resolve.
   */
  resolve(uri: URL, ctx: ResolveCtx): HandlerOutcome
}

/**
 * Per-handler metadata used by doctor introspection. The `purpose` field is
 * a human-readable one-liner; `hostParsers` is set only on `https` (where
 * one handler dispatches across multiple per-host URL parsers). Keep this
 * table aligned with the registry below — every entry in `HANDLERS` should
 * have a sibling row here.
 */
type HandlerInfo = {
  readonly handler: Handler
  readonly purpose: string
  readonly hostParsers?: readonly HttpsHostParser[]
}

const HANDLER_INFOS: readonly HandlerInfo[] = [
  { handler: fileHandler, purpose: "readme / first-paragraph (file-backed)" },
  { handler: bdHandler, purpose: "bd-active (bead lookup)" },
  { handler: shellHandler, purpose: "sandboxed argv command" },
  {
    handler: httpsHandler,
    purpose: `webcard + ${HTTPS_HOST_PARSERS.length} host parsers`,
    hostParsers: HTTPS_HOST_PARSERS,
  },
  { handler: mcpHandler, purpose: "stub — see km-silvercode.autolinks-mcp-resolver" },
]

/**
 * The hardcoded v1 handler registry. Order matters when multiple handlers
 * could claim a scheme: the first match wins. `https` is registered after
 * the more specific schemes so future overrides could shadow it.
 *
 * v2 will allow appending user-defined handlers from `.km/config.yaml`.
 * That landing point is deliberately a separate bead — v1's job is the
 * internal architectural shape, not the new user-facing surface.
 */
const HANDLERS: readonly Handler[] = HANDLER_INFOS.map((info) => info.handler)

/**
 * The set of registered schemes — exposed for doctor introspection.
 */
export function registeredSchemes(): readonly string[] {
  return HANDLERS.map((h) => h.scheme)
}

/**
 * Enumerate registered handlers for doctor introspection. Returns each
 * scheme + purpose, plus (for `https`) the list of host parsers. Pure — no
 * IO, safe to call from any context.
 */
export type HandlerListing = {
  readonly scheme: string
  readonly purpose: string
  readonly hostParsers?: readonly HttpsHostParser[]
}

export function listHandlers(): readonly HandlerListing[] {
  return HANDLER_INFOS.map((info) => {
    const listing: HandlerListing = info.hostParsers
      ? { scheme: info.handler.scheme, purpose: info.purpose, hostParsers: info.hostParsers }
      : { scheme: info.handler.scheme, purpose: info.purpose }
    return listing
  })
}

/**
 * Pick the handler for a URI. Strips the trailing colon from `URL.protocol`
 * so callers don't have to mentally adjust between `"file:"` and `"file"`.
 */
export function findHandler(uri: URL): Handler | null {
  const scheme = uri.protocol.replace(/:$/, "")
  for (const h of HANDLERS) {
    if (h.scheme !== scheme) continue
    if (h.hosts && h.hosts.length > 0 && !h.hosts.includes(uri.host)) continue
    return h
  }
  return null
}

/**
 * Resolve a URI through the registry. Returns a `HandlerOutcome` regardless
 * of outcome — unhandled schemes produce an error result with no watch path
 * (exactly the "doctor surface" condition we want to flag separately too).
 */
export function resolveURI(uri: URL, ctx: ResolveCtx): HandlerOutcome {
  const handler = findHandler(uri)
  if (!handler) {
    const t = (ctx.now ?? Date.now)()
    return {
      result: {
        kind: "error",
        message: `no handler for URI scheme \`${uri.protocol.replace(/:$/, "")}\` (uri: ${uri.toString()})`,
        resolvedAt: t,
      },
    }
  }
  return handler.resolve(uri, ctx)
}
