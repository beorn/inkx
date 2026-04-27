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
import { homedir } from "node:os"
import { join } from "node:path"
import createDebug from "debug"
import type { Scope } from "@silvery/scope"
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
  const busPath = opts.busPath ?? process.env.TRIBE_BUS_PATH ?? join(homedir(), ".km", "tribe-bus.jsonl")
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
// Stub sources — wiring lives in follow-up beads.
// ---------------------------------------------------------------------------

/**
 * Telegram channel — pushes inbound DMs / approved-channel messages as
 * ambient events. TODO: wire telegram bot stream once
 * `apps/silvercode/packages/telegram-channel` (or equivalent) lands.
 * Until then this is a no-op so wireChannelSources can call it
 * unconditionally.
 */
export function subscribeTelegram(_scope: Scope, _queue: ChannelQueue): void {
  // TODO: wire telegram — pair with the telegram-access skill /
  // bot-token configuration from km-silvercode.acp parent epic.
  dSources("subscribeTelegram — no-op (TODO: wire telegram source)")
}

/**
 * CI channel — pushes GitHub Actions / pre-push verdicts as ambient
 * events. TODO: wire CI webhook ingest.
 */
export function subscribeCi(_scope: Scope, _queue: ChannelQueue): void {
  // TODO: wire CI — listen on a webhook endpoint or periodically poll
  // `gh run list --branch <head>` for the active branch.
  dSources("subscribeCi — no-op (TODO: wire CI source)")
}

/**
 * Lore channel — pushes lore_brief deltas (vault notes added to the
 * active topic) as ambient events. TODO: wire lore-mcp subscription
 * stream.
 */
export function subscribeLore(_scope: Scope, _queue: ChannelQueue): void {
  // TODO: wire lore — subscribe to lore-mcp's "delta" stream once the
  // MCP server exposes it. For now the agent uses lore_brief on demand.
  dSources("subscribeLore — no-op (TODO: wire lore source)")
}

/**
 * Sub-agent channel — pushes Task-tool sub-agent status updates (started,
 * progressed, completed) as ambient events so the user sees a coordination
 * trail without context-stuffing. TODO: wire sub-agent reporter once the
 * harness exposes a structured sub-agent event stream.
 */
export function subscribeSubagent(_scope: Scope, _queue: ChannelQueue): void {
  // TODO: wire sub-agent — `Task` tool currently returns a final result
  // only; we want progress events too.
  dSources("subscribeSubagent — no-op (TODO: wire sub-agent source)")
}

// ---------------------------------------------------------------------------
// Convenience wirer — controller calls this once on init.
// ---------------------------------------------------------------------------

export type WireChannelSourcesOptions = {
  /** Override the tribe bus path; default: `$TRIBE_BUS_PATH` or `~/.km/tribe-bus.jsonl`. */
  tribeBusPath?: string
  /** Disable individual sources by name (e.g. for tests). */
  disable?: Partial<Record<"tribe" | "telegram" | "ci" | "lore" | "subagent", boolean>>
}

/**
 * Subscribe every available channel source onto `queue`, gated by env /
 * config so sources that aren't yet implemented (or aren't configured in
 * the current shell) stay quiet. Idempotent per scope — call once on
 * controller init. Disposing the scope unsubscribes everything.
 */
export function wireChannelSources(scope: Scope, queue: ChannelQueue, opts: WireChannelSourcesOptions = {}): void {
  const disable = opts.disable ?? {}
  if (!disable.tribe) subscribeTribe(scope, queue, { busPath: opts.tribeBusPath })
  if (!disable.telegram) subscribeTelegram(scope, queue)
  if (!disable.ci) subscribeCi(scope, queue)
  if (!disable.lore) subscribeLore(scope, queue)
  if (!disable.subagent) subscribeSubagent(scope, queue)
}
