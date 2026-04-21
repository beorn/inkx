/**
 * Theme cache — persists the probed terminal theme across runs so cold starts
 * can paint with the correct palette on the *first* frame instead of the
 * defaults.
 *
 * Keyed by terminal program + polarity (dark/light) — this is the coarsest
 * key that identifies a unique palette. Same program, same mode → same
 * colors. On palette change (e.g. user switches Ghostty's theme), the next
 * probe will overwrite the cache with the new values, so the cache
 * self-heals with one frame of stale colors.
 *
 * Storage: `~/.cache/km/theme-cache.json` (XDG-style). Small JSON blob
 * (a few KB). Lookups are O(1) hash hits, no async I/O.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { dirname, join } from "path"
import { homedir } from "os"
import type { Theme } from "@silvery/ag-react"
import { createLogger } from "@km/core"

const log = createLogger("km:tui:theme-cache")

export interface ThemeCacheKey {
  program: string
  dark: boolean
}

interface CacheFile {
  version: 1
  entries: Record<string, Theme>
}

function cachePath(): string {
  const xdgCache = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache")
  return join(xdgCache, "km", "theme-cache.json")
}

function cacheKey(key: ThemeCacheKey): string {
  return `${key.program}:${key.dark ? "dark" : "light"}`
}

let memoCache: CacheFile | null = null
let loaded = false

function readCache(): CacheFile {
  if (loaded && memoCache) return memoCache
  loaded = true
  const path = cachePath()
  if (!existsSync(path)) {
    memoCache = { version: 1, entries: {} }
    return memoCache
  }
  try {
    const raw = readFileSync(path, "utf-8")
    const parsed = JSON.parse(raw) as CacheFile
    if (parsed.version !== 1 || typeof parsed.entries !== "object") {
      log.debug?.(`theme-cache: bad schema version ${parsed.version}, ignoring`)
      memoCache = { version: 1, entries: {} }
      return memoCache
    }
    memoCache = parsed
    return parsed
  } catch (err) {
    log.debug?.(`theme-cache: failed to read cache: ${err instanceof Error ? err.message : String(err)}`)
    memoCache = { version: 1, entries: {} }
    return memoCache
  }
}

export function loadCachedTheme(key: ThemeCacheKey): Theme | null {
  const cache = readCache()
  return cache.entries[cacheKey(key)] ?? null
}

export function saveCachedTheme(key: ThemeCacheKey, theme: Theme): void {
  const cache = readCache()
  cache.entries[cacheKey(key)] = theme
  const path = cachePath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(cache), "utf-8")
    log.debug?.(`theme-cache: saved ${theme.name} for ${cacheKey(key)}`)
  } catch (err) {
    log.debug?.(`theme-cache: save failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
