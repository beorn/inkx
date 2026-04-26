/**
 * `bd:` handler — runs `bd list --parent <id> --status open --limit 5` and
 * returns its stdout. The "id" is decoded from the URI's host (when present)
 * or pathname (for opaque `bd:<id>` URIs).
 *
 * Output is cached upstream with a 30s TTL — there's no file to watch since
 * the bd database state is opaque to us.
 */

import { spawnSync } from "node:child_process"
import type { Handler, HandlerOutcome, ResolveCtx } from "./index.ts"
import { bdIdFromURL } from "../uri.ts"

export const bdHandler: Handler = {
  scheme: "bd",
  resolve(uri: URL, ctx: ResolveCtx): HandlerOutcome {
    const t = (ctx.now ?? Date.now)()
    const parentId = bdIdFromURL(uri)
    if (parentId.length === 0) {
      return { result: { kind: "error", message: "bd URI missing parent id", resolvedAt: t } }
    }

    // Synchronous spawn keeps the popover render path single-shot — the 30s
    // cache amortizes subprocess cost across hovers.
    const proc = spawnSync("bd", ["list", "--parent", parentId, "--status", "open", "--limit", "5"], {
      encoding: "utf-8",
      timeout: 5_000,
    })
    if (proc.error) {
      return { result: { kind: "error", message: `bd: ${String(proc.error)}`, resolvedAt: t } }
    }
    if (proc.status !== 0) {
      const stderr = (proc.stderr ?? "").trim()
      return {
        result: {
          kind: "error",
          message: `bd exited ${proc.status}${stderr ? `: ${stderr}` : ""}`,
          resolvedAt: t,
        },
      }
    }
    const stdout = (proc.stdout ?? "").trim()
    const body = stdout.length > 0 ? stdout : `No open beads under ${parentId}.`
    return { result: { kind: "ok", body, format: "text", resolvedAt: t } }
  },
}
