/**
 * Tribe ambient adapter — tails the bearly tribe activity log and emits
 * peer broadcasts / DMs as `source: "tribe"` ambient events.
 *
 * This is Phase 6.b's *replacement* surface for the existing
 * `subscribeTribe` in `channel-sources.ts`. Differences:
 *
 *   - Sanitizes every payload through `sanitizeAmbient` (Layer 2 of the
 *     ambient-context safety stack — see
 *     `hub/silvercode/design/ambient-context-safety.md`).
 *   - Per-source debounce (≥ 500 ms between emits) so a chatty peer can't
 *     swamp the channel queue.
 *   - Source-tagged events with a stable id so the per-source mute toggles
 *     in `SidePanel` can filter without reading payload contents.
 *
 * Bus path resolution mirrors the activity-log default in
 * `vendor/bearly/tools/lib/tribe/activity-log.ts`:
 *
 *   1. `opts.busPath` (test override).
 *   2. `$TRIBE_ACTIVITY_LOG` env var, unless set to "off".
 *   3. `$TRIBE_BUS_PATH` env var (legacy, kept for back-compat with the
 *      original `subscribeTribe` knob).
 *   4. `~/.local/share/tribe/activity.jsonl` (the bearly default).
 *   5. `~/.km/tribe-bus.jsonl` (legacy fallback if no other path exists).
 *
 * On startup we seek to the END of the file — silvercode does not replay
 * history at boot. Disposing the scope closes the watcher + read stream.
 */

import { createReadStream, existsSync, statSync, watch } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import createDebug from "debug"
import type { AmbientAdapterCtx } from "./types.ts"
import { createDebouncedEmit, makeAmbientEventId } from "./types.ts"

const dTribe = createDebug("silvercode:ambient:tribe")

const SOURCE = "tribe" as const

export type TribeAdapterOptions = AmbientAdapterCtx & {
  /** Override the tribe bus path; default: env or `~/.local/share/tribe/activity.jsonl`. */
  readonly busPath?: string
}

function resolveBusPath(busPath: string | undefined): string {
  if (busPath) return busPath
  const env = process.env.TRIBE_ACTIVITY_LOG
  if (env && env !== "off") return env
  const legacy = process.env.TRIBE_BUS_PATH
  if (legacy) return legacy
  const home = homedir()
  const primary = join(home, ".local", "share", "tribe", "activity.jsonl")
  if (existsSync(primary)) return primary
  return join(home, ".km", "tribe-bus.jsonl")
}

/**
 * One activity-log line, parsed. Mirrors `ActivityEntry` from the bearly
 * activity-log module — we only consume the fields we render.
 */
type TribeLine = {
  ts?: number
  kind?: string
  source?: string
  peer?: string
  preview?: string
  type?: string
  session?: string
}

function buildContent(line: TribeLine, raw: string): string {
  // Activity log carries `preview` for short summaries; fall back to the
  // legacy `text`/`body` shape when consuming an old-style tribe-bus file.
  if (typeof line.preview === "string" && line.preview.length > 0) {
    const peer = line.peer ?? "tribe"
    return `[${line.kind ?? "tribe"} ${peer}] ${line.preview}`
  }
  // Best-effort fallback for legacy bus shape: parse the raw JSON for a
  // `text`/`body` field. This keeps adapter output reasonable on the
  // older `~/.km/tribe-bus.jsonl` format.
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const text = typeof parsed.text === "string" ? parsed.text : typeof parsed.body === "string" ? parsed.body : ""
    const from = typeof parsed.from === "string" ? parsed.from : (line.peer ?? "tribe")
    if (text.length > 0) return `[tribe ${from}] ${text}`
  } catch {
    /* fall through */
  }
  return ""
}

/**
 * Register the tribe adapter on `ctx.scope`. Returns a synchronous
 * disposer (the scope's defer will also dispose, but the explicit fn is
 * convenient for tests + the index barrel).
 */
export function registerTribeAmbientAdapter(opts: TribeAdapterOptions): () => void {
  const busPath = resolveBusPath(opts.busPath)
  const emit = createDebouncedEmit(opts)

  if (!existsSync(busPath)) {
    dTribe("no bus file at %s — adapter is a no-op until restart", busPath)
    return () => undefined
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
  let disposed = false

  function readNew(): void {
    if (disposed) return
    if (reading) {
      pending = true
      return
    }
    reading = true
    try {
      const size = statSync(busPath).size
      if (size <= offset) {
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
        if (pending && !disposed) {
          pending = false
          readNew()
        }
      })
      stream.on("error", (err) => {
        dTribe("read error: %s", err)
        reading = false
      })
    } catch (err) {
      dTribe("stat error: %s", err)
      reading = false
    }
  }

  function emitLine(line: string): void {
    let parsed: TribeLine
    try {
      parsed = JSON.parse(line) as TribeLine
    } catch {
      dTribe("drop unparseable line: %s", line.slice(0, 80))
      return
    }
    const content = buildContent(parsed, line)
    if (content.length === 0) return
    const ts = typeof parsed.ts === "number" ? parsed.ts : Date.now()
    const peer = parsed.peer
    emit({
      id: makeAmbientEventId(SOURCE),
      source: SOURCE,
      timestamp: ts,
      content,
      meta: { kind: "peer-message", peer, fromSessionId: parsed.session },
    })
  }

  let watcher: ReturnType<typeof watch> | null = null
  try {
    watcher = watch(busPath, { persistent: false }, (eventType) => {
      if (eventType === "change" || eventType === "rename") readNew()
    })
  } catch (err) {
    dTribe("watch error: %s", err)
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    try {
      watcher?.close()
    } catch {
      /* nothing to do — scope teardown */
    }
  }

  opts.scope.defer(dispose)
  return dispose
}

/**
 * Test-only: drive a single bus line through the same emit path as the
 * watcher would. Surfaces the raw text → sanitize → debounce path
 * without standing up a real fs.watch on a tempfile.
 */
export function emitTribeLineForTest(opts: AmbientAdapterCtx, line: string): boolean {
  const emit = createDebouncedEmit(opts)
  let parsed: TribeLine
  try {
    parsed = JSON.parse(line) as TribeLine
  } catch {
    return false
  }
  const content = buildContent(parsed, line)
  if (content.length === 0) return false
  return emit({
    id: makeAmbientEventId(SOURCE),
    source: SOURCE,
    timestamp: typeof parsed.ts === "number" ? parsed.ts : Date.now(),
    content,
    meta: { kind: "peer-message", peer: parsed.peer, fromSessionId: parsed.session },
  })
}
