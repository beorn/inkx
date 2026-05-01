/**
 * Channel sources — subscribers that push ambient events into the
 * silvercode-owned `ChannelQueue`.
 *
 * Each source is a small, scope-bound subscriber. The convention is:
 *
 *   `subscribe<Source>(scope, queue, opts?)` → registers a teardown on
 *   `scope` and returns void. The function is allowed to be a no-op (or to
 *   bail out early if the source isn't configured for this process).
 *
 * `wireChannelSources(scope, queue, opts?)` is the convenience wrapper that
 * the silvercode controller calls on init — it gates each subscriber on env /
 * config so sources that aren't yet implemented (or aren't configured in the
 * current shell) silently stay quiet.
 *
 * The subscribers populate the queue; the actual *injection* decision (do we
 * prepend these as typed `EmbeddedResource` blocks on the next user prompt?)
 * lives in `prompt-assembly.ts`. By default the queue holds and the user
 * decides via `/inject-tribe` slash commands — see
 * `hub/silvercode/future/ai-terminal/10-agent-router-landscape.md` § "Replacing
 * Claude Code's <channel> injection with ACP primitives" for the rationale
 * (Option 1: UI-first / user-mediated).
 */

import { createReadStream, existsSync, statSync, watch } from "node:fs"
import createDebug from "debug"
import type { Scope } from "@silvery/scope"
import { defaultTribeBusPath } from "@km/config/paths"
import type { ChannelEvent, ChannelQueue } from "./channel-queue.ts"

const dSources = createDebug("silvercode:channel-sources")

let nextEventId = 1
function makeId(source: string): string {
  return `${source}-${Date.now()}-${nextEventId++}`
}

// ---------------------------------------------------------------------------
// Tribe — tail ~/.km/tribe-bus.jsonl
// ---------------------------------------------------------------------------

/**
 * Tail the tribe JSONL bus and push every newly-appended record onto the
 * queue as `source: "tribe"`. Honours `TRIBE_BUS_PATH` (matches what
 * `tribe-mcp/src/bin.ts` reads) so a custom bus path Just Works.
 *
 * On startup we seek to the END of the file — silvercode does not replay
 * history at boot, only forwards new traffic. Disposing the scope closes
 * the watcher and the read stream.
 *
 * No-op if the bus file doesn't exist (it'll be created the first time a
 * tribe MCP writes to it; users will need to restart silvercode to start
 * tailing — keeping this synchronous + simple for now). A future revision
 * can add directory watching to pick the file up on creation.
 */
export function subscribeTribe(scope: Scope, queue: ChannelQueue, opts: { busPath?: string } = {}): void {
  const busPath = opts.busPath ?? process.env.TRIBE_BUS_PATH ?? defaultTribeBusPath()
  if (!existsSync(busPath)) {
    dSources("subscribeTribe — %s does not exist, no-op", busPath)
    return
  }

  let offset = 0
  try {
    offset = statSync(busPath).size
  } catch {
    /* swallow — fall through with offset=0 */
  }

  let reading = false
  let pending = false
  let buffer = ""

  function readNew(): void {
    if (reading) {
      pending = true
      return
    }
    reading = true
    try {
      const size = statSync(busPath).size
      if (size <= offset) {
        // File truncated or unchanged — re-anchor at end on truncation.
        if (size < offset) offset = size
        reading = false
        return
      }
      const stream = createReadStream(busPath, { start: offset, end: size - 1, encoding: "utf8" })
      offset = size
      stream.on("data", (chunk: string | Buffer) => {
        buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8")
        let nl = buffer.indexOf("\n")
        while (nl >= 0) {
          const line = buffer.slice(0, nl).trim()
          buffer = buffer.slice(nl + 1)
          if (line.length > 0) emitLine(line)
          nl = buffer.indexOf("\n")
        }
      })
      stream.on("end", () => {
        reading = false
        if (pending) {
          pending = false
          readNew()
        }
      })
      stream.on("error", (err) => {
        dSources("subscribeTribe — read error: %s", err)
        reading = false
      })
    } catch (err) {
      dSources("subscribeTribe — stat error: %s", err)
      reading = false
    }
  }

  function emitLine(line: string): void {
    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(line) as Record<string, unknown>
    } catch {
      dSources("subscribeTribe — drop unparseable line: %s", line.slice(0, 80))
      return
    }
    if (!parsed || typeof parsed !== "object") return
    const from = typeof parsed.from === "string" ? parsed.from : "tribe"
    const text = typeof parsed.text === "string" ? parsed.text : typeof parsed.body === "string" ? parsed.body : ""
    if (text.length === 0) return
    const ts = typeof parsed.ts === "number" ? parsed.ts : Date.now()
    const event: ChannelEvent = {
      id: makeId("tribe"),
      source: "tribe",
      timestamp: ts,
      content: `[tribe ${from}] ${text}`,
      meta: { from, raw: parsed },
    }
    queue.enqueue(event)
  }

  let watcher: ReturnType<typeof watch> | null = null
  try {
    watcher = watch(busPath, { persistent: false }, (eventType) => {
      if (eventType === "change" || eventType === "rename") {
        readNew()
      }
    })
  } catch (err) {
    dSources("subscribeTribe — watch error: %s", err)
  }

  scope.defer(() => {
    try {
      watcher?.close()
    } catch {
      /* nothing useful to do — scope is being torn down */
    }
  })
}

// ---------------------------------------------------------------------------
// Convenience wirer — controller calls this once on init.
// ---------------------------------------------------------------------------

// Other sources (ci, recall, subagent, filewatch) live in
// `apps/silvercode/src/ambient-adapters/` — that pipeline adds sanitize +
// debounce + per-source telemetry. The legacy tribe subscriber stays here
// only as a fallback path; the new tribe adapter (with `~/.local/share/tribe/
// activity.jsonl` primary + `~/.km/tribe-bus.jsonl` legacy fallback) is the
// canonical one. Use `disableLegacyTribeSource` on the controller to opt out
// once the new path is verified for your setup.

export type WireChannelSourcesOptions = {
  /** Override the tribe bus path; default: `$TRIBE_BUS_PATH` or `~/.km/tribe-bus.jsonl`. */
  tribeBusPath?: string
  /** Disable the tribe subscriber (e.g. for tests, or to avoid double-emit). */
  disable?: { tribe?: boolean }
}

/**
 * Subscribe the legacy tribe channel source onto `queue`. Idempotent per
 * scope — call once on controller init. Disposing the scope unsubscribes.
 */
export function wireChannelSources(scope: Scope, queue: ChannelQueue, opts: WireChannelSourcesOptions = {}): void {
  if (opts.disable?.tribe) return
  subscribeTribe(scope, queue, { busPath: opts.tribeBusPath })
}
