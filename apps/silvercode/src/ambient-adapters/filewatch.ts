/**
 * Filewatch ambient adapter — `fs.watch` on the session cwd, emits
 * `source: "filewatch"` ambient events when files change.
 *
 * Bookkeeping is intentionally minimal:
 *
 *   - One recursive watcher rooted at the session cwd. macOS supports
 *     `recursive: true` natively; on Linux we fall back to a non-recursive
 *     watch and accept that subdirectory edits won't fire (the breaker +
 *     debounce make that acceptable until a future revision wires up a
 *     deeper watcher).
 *   - Each `change` event is bucketed by basename and **debounced 500 ms**
 *     before emit (one path → one event per 500 ms window). The
 *     per-adapter debounce (in `types.ts`) layers on top, so a flurry of
 *     unrelated paths still produces ≤ 1 event per 500 ms across the whole
 *     adapter.
 *   - Common noise paths (`node_modules`, `.git`, `dist`, `.beads`,
 *     `.km`) are filtered. These are the directories silvercode itself
 *     thrashes constantly; surfacing them as ambient is pure noise.
 *
 * Sanitization runs through `createDebouncedEmit` like every other
 * adapter — paths can't contain a role-prefix marker in practice but we
 * pass through Layer 2 unconditionally per `ambient-context-safety.md`
 * § 3.
 */

import { watch } from "node:fs"
import { basename, relative } from "node:path"
import createDebug from "debug"
import type { AmbientAdapterCtx } from "./types.ts"
import { createDebouncedEmit, makeAmbientEventId, MIN_INTER_EVENT_MS } from "./types.ts"

const dWatch = createDebug("silvercode:ambient:filewatch")

const SOURCE = "filewatch" as const

const NOISE_PREFIXES: readonly string[] = ["node_modules/", ".git/", "dist/", ".beads/", ".km/", ".vitest/", ".direnv/"]

export type FilewatchAdapterOptions = AmbientAdapterCtx & {
  /** Directory to watch. Required — usually the session's cwd. */
  readonly cwd: string
  /**
   * Per-path debounce window. Defaults to `MIN_INTER_EVENT_MS` (500 ms)
   * which matches the spec — same path within the window collapses to one
   * emit.
   */
  readonly perPathDebounceMs?: number
  /** Watch recursively. Default true; set false for tests / non-darwin. */
  readonly recursive?: boolean
}

function isNoise(rel: string): boolean {
  for (const prefix of NOISE_PREFIXES) {
    if (rel.startsWith(prefix) || rel.includes(`/${prefix}`)) return true
  }
  // Hidden file at root is fine (e.g. `.envrc`); but `.something/` is a
  // dotdir and we filter it via the prefixes above. Per-file dotfiles
  // (`.DS_Store`, lockfiles) get through and then get debounced.
  return false
}

/**
 * Pure helper exposed for tests: classify a single path event the way the
 * adapter would, returning `null` if filtered out. The full integration
 * test below exercises the real watcher; this lets us assert filter
 * behaviour without fs flakiness.
 */
export function classifyFilewatchPath(cwd: string, abs: string): { rel: string; content: string } | null {
  const rel = relative(cwd, abs)
  if (rel.length === 0 || rel.startsWith("..")) return null
  if (isNoise(rel)) return null
  return { rel, content: `${basename(abs)} changed (${rel})` }
}

/**
 * Register the filewatch adapter. Returns a synchronous disposer.
 */
export function registerFilewatchAmbientAdapter(opts: FilewatchAdapterOptions): () => void {
  const debounceMs = opts.perPathDebounceMs ?? MIN_INTER_EVENT_MS
  const recursive = opts.recursive !== false && process.platform === "darwin"
  const emit = createDebouncedEmit(opts)
  const lastSeen = new Map<string, number>()
  let disposed = false

  let watcher: ReturnType<typeof watch> | null = null
  try {
    watcher = watch(opts.cwd, { persistent: false, recursive }, (eventType, filename: string | Buffer | null) => {
      if (disposed) return
      if (!filename) return
      const rel = typeof filename === "string" ? filename : filename.toString("utf8")
      if (rel.length === 0) return
      if (isNoise(rel)) return
      const t = (opts.now ?? Date.now)()
      const prev = lastSeen.get(rel) ?? 0
      if (t - prev < debounceMs) return
      lastSeen.set(rel, t)
      // Best-effort cap to keep the dedupe map from growing unbounded
      // when an agent edits many files in one burst.
      if (lastSeen.size > 1024) {
        const cutoff = t - debounceMs * 4
        for (const [k, v] of lastSeen) if (v < cutoff) lastSeen.delete(k)
      }
      emit({
        id: makeAmbientEventId(SOURCE),
        source: SOURCE,
        timestamp: t,
        content: `${basename(rel)} ${eventType} (${rel})`,
        meta: { kind: "fs-change", path: rel, eventType },
      })
    })
  } catch (err) {
    dWatch("watch error on %s: %s", opts.cwd, err)
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    try {
      watcher?.close()
    } catch {
      /* scope teardown */
    }
  }
  opts.scope.defer(dispose)
  return dispose
}
