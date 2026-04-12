#!/usr/bin/env bun
/**
 * npm Registry CLI — query, audit, and manage packages published by maintainer `beorno`.
 *
 * Usage:
 *   bun npm-registry list                      # All packages by maintainer beorno
 *   bun npm-registry status <pkg>              # Detail for one package
 *   bun npm-registry audit                     # Cross-check md registry vs live npm
 *   bun npm-registry placeholders              # Known stale placeholders
 *   bun npm-registry renamed                   # Known renamed/superseded packages
 *   bun npm-registry deprecate <pkg> "<msg>"   # npm deprecate "<pkg>@*" "<msg>"
 *   bun npm-registry undeprecate <pkg>         # Clear deprecation
 *
 * All registry calls are cached for 5 minutes in /tmp/.npm-registry-cache.json
 * to avoid hammering the API.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { execSync, spawnSync } from "node:child_process"

const ROOT = join(import.meta.dir, "..", "..", "..")
const REGISTRY_MD = join(ROOT, ".claude/skills/release/npm-packages.md")
const CACHE_FILE = "/tmp/.npm-registry-cache.json"
const CACHE_TTL_MS = 5 * 60 * 1000
const MAINTAINER = "beorno"

// ─── Known lists (curated) ──────────────────────────────────────────────────

// Stale placeholders that should be deprecated and not used
const PLACEHOLDERS = [
  "aicentral",
  "corecmd",
  "corecommand",
  "silverai",
  "silvercode",
  "silvercommand",
  "silvertea",
  "termily",
  "textily",
  "@visory/visory",
  "mostlydb",
  "hottest",
  "strictest",
  "@finetea/term",
  "@finetea/ansi",
  "@finetea/core",
  "@finetea/ui",
  "@termless/term",
] as const

// Renamed/superseded packages — should be deprecated with redirect message
const RENAMED: { from: string; to: string }[] = [
  { from: "@bearly/vitepress-enrich", to: "vitepress-enrich" },
  { from: "@bearly/mdtest", to: "mdspec" },
  { from: "@silvery/react", to: "silvery" },
  { from: "@silvery/tea", to: "silvery" },
  { from: "@silvery/term", to: "silvery" },
  { from: "@silvery/cli", to: "silvery" },
  { from: "@termless/monorepo", to: "@termless/core" },
  { from: "termless", to: "@termless/core" },
]

// ─── Cache ───────────────────────────────────────────────────────────────────

interface CacheEntry { ts: number; data: unknown }
type Cache = Record<string, CacheEntry>

function loadCache(): Cache {
  if (!existsSync(CACHE_FILE)) return {}
  try { return JSON.parse(readFileSync(CACHE_FILE, "utf8")) as Cache } catch { return {} }
}

function saveCache(cache: Cache): void {
  try { writeFileSync(CACHE_FILE, JSON.stringify(cache)) } catch { /* ignore */ }
}

async function cachedFetch<T = unknown>(url: string): Promise<T> {
  const cache = loadCache()
  const hit = cache[url]
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data as T
  const res = await fetch(url, { headers: { Accept: "application/json" } })
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`)
  const data = (await res.json()) as T
  cache[url] = { ts: Date.now(), data }
  saveCache(cache)
  return data
}

// ─── Color helpers (avoid silvery dep so this runs standalone) ──────────────

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[22m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[22m`,
  red: (s: string) => `\x1b[31m${s}\x1b[39m`,
  green: (s: string) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[39m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[39m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[39m`,
}

// ─── Registry types ─────────────────────────────────────────────────────────

interface SearchObject {
  package: {
    name: string
    version: string
    description?: string
    date?: string
    maintainers?: { username: string }[]
  }
}
interface SearchResponse {
  objects: SearchObject[]
  total: number
}

interface PackageMeta {
  name: string
  "dist-tags"?: Record<string, string>
  versions?: Record<string, { deprecated?: string }>
  time?: Record<string, string>
  maintainers?: { name: string }[]
}

interface DownloadResponse { downloads: number; package: string }

// ─── API wrappers ───────────────────────────────────────────────────────────

async function fetchAllByMaintainer(maintainer: string): Promise<SearchObject[]> {
  const all: SearchObject[] = []
  let from = 0
  const size = 250
  while (true) {
    const url = `https://registry.npmjs.org/-/v1/search?text=maintainer:${maintainer}&size=${size}&from=${from}`
    const res = await cachedFetch<SearchResponse>(url)
    all.push(...res.objects)
    if (all.length >= res.total || res.objects.length === 0) break
    from += size
    if (from > 5000) break // sanity
  }
  return all
}

async function fetchPackageMeta(name: string): Promise<PackageMeta | null> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name).replace("%40", "@")}`
  try { return await cachedFetch<PackageMeta>(url) } catch { return null }
}

async function fetchWeeklyDownloads(name: string): Promise<number> {
  const url = `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name).replace("%40", "@")}`
  try {
    const r = await cachedFetch<DownloadResponse>(url)
    return r.downloads ?? 0
  } catch { return 0 }
}

function latestVersion(meta: PackageMeta): string {
  return meta["dist-tags"]?.latest ?? ""
}

function deprecationOf(meta: PackageMeta): string | null {
  const latest = latestVersion(meta)
  if (!latest) return null
  return meta.versions?.[latest]?.deprecated ?? null
}

function publishedAt(meta: PackageMeta): string {
  const latest = latestVersion(meta)
  return meta.time?.[latest] ?? meta.time?.modified ?? ""
}

// ─── Subcommands ────────────────────────────────────────────────────────────

async function cmdList(): Promise<void> {
  const objs = await fetchAllByMaintainer(MAINTAINER)
  console.log(c.bold(`\n${objs.length} packages published by ${MAINTAINER}\n`))
  console.log(`${pad("PACKAGE", 36)} ${pad("VERSION", 10)} ${pad("WK DL", 8)}  STATUS`)
  console.log(c.dim("─".repeat(72)))
  // Sort: scoped packages by scope, then bare
  const sorted = [...objs].sort((a, b) => a.package.name.localeCompare(b.package.name))
  for (const o of sorted) {
    const name = o.package.name
    const version = o.package.version
    // Note: search API doesn't include deprecation; fetch meta only on demand for `status`
    const dlPromise = fetchWeeklyDownloads(name)
    const metaPromise = fetchPackageMeta(name)
    const [dl, meta] = await Promise.all([dlPromise, metaPromise])
    const dep = meta ? deprecationOf(meta) : null
    const status = dep ? c.yellow("DEPRECATED") : c.green("active")
    console.log(`${pad(name, 36)} ${pad(version, 10)} ${pad(String(dl), 8)}  ${status}${dep ? c.dim(" — " + dep.slice(0, 40)) : ""}`)
  }
}

async function cmdStatus(name: string): Promise<void> {
  if (!name) { console.error("usage: status <pkg>"); process.exit(2) }
  const meta = await fetchPackageMeta(name)
  if (!meta) { console.error(c.red(`not found: ${name}`)); process.exit(1) }
  const latest = latestVersion(meta)
  const dl = await fetchWeeklyDownloads(name)
  const dep = deprecationOf(meta)
  const date = publishedAt(meta)
  console.log(c.bold(`\n${name}\n`))
  console.log(`  ${pad("latest:", 18)}${latest}`)
  console.log(`  ${pad("dist-tags:", 18)}${JSON.stringify(meta["dist-tags"] ?? {})}`)
  console.log(`  ${pad("published:", 18)}${date ? new Date(date).toISOString().slice(0, 10) : "-"}`)
  console.log(`  ${pad("weekly downloads:", 18)}${dl}`)
  console.log(`  ${pad("maintainers:", 18)}${(meta.maintainers ?? []).map((m) => m.name).join(", ")}`)
  console.log(`  ${pad("deprecated:", 18)}${dep ? c.yellow(dep) : c.green("no")}`)
  console.log()
}

async function cmdAudit(): Promise<void> {
  const objs = await fetchAllByMaintainer(MAINTAINER)
  const live = new Map(objs.map((o) => [o.package.name, o.package.version]))
  const md = parseRegistryMd()

  console.log(c.bold(`\nAudit: live registry vs ${REGISTRY_MD}\n`))
  console.log(`  live: ${live.size} packages by ${MAINTAINER}`)
  console.log(`  md:   ${md.size} packages\n`)

  // 1. In live, missing from md
  const missingInMd: string[] = []
  for (const name of live.keys()) {
    if (!md.has(name)) missingInMd.push(name)
  }
  if (missingInMd.length > 0) {
    console.log(c.yellow(`Missing from npm-packages.md (${missingInMd.length}):`))
    for (const n of missingInMd.sort()) console.log(`  + ${n}@${live.get(n)}`)
    console.log()
  }

  // 2. In md, missing from live
  const missingInLive: string[] = []
  for (const name of md.keys()) {
    if (!live.has(name)) missingInLive.push(name)
  }
  if (missingInLive.length > 0) {
    console.log(c.yellow(`In npm-packages.md but not on registry (${missingInLive.length}):`))
    for (const n of missingInLive.sort()) console.log(`  - ${n}`)
    console.log()
  }

  // 3. Version mismatches
  const drifted: { name: string; md: string; live: string }[] = []
  for (const [name, mdVer] of md.entries()) {
    const liveVer = live.get(name)
    if (liveVer && mdVer && mdVer !== liveVer) {
      drifted.push({ name, md: mdVer, live: liveVer })
    }
  }
  if (drifted.length > 0) {
    console.log(c.yellow(`Version drift (${drifted.length}):`))
    for (const d of drifted.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`  ~ ${pad(d.name, 36)} md=${d.md}  live=${d.live}`)
    }
    console.log()
  }

  // 4. Newly deprecated (live deprecated, md doesn't say so)
  const newlyDeprecated: string[] = []
  for (const name of live.keys()) {
    const meta = await fetchPackageMeta(name)
    if (meta && deprecationOf(meta) && !md.deprecated.has(name)) {
      newlyDeprecated.push(name)
    }
  }
  if (newlyDeprecated.length > 0) {
    console.log(c.yellow(`Deprecated on registry but listed as active in md (${newlyDeprecated.length}):`))
    for (const n of newlyDeprecated.sort()) console.log(`  ! ${n}`)
    console.log()
  }

  if (
    missingInMd.length === 0 &&
    missingInLive.length === 0 &&
    drifted.length === 0 &&
    newlyDeprecated.length === 0
  ) {
    console.log(c.green("✓ npm-packages.md is in sync with the registry."))
  } else {
    console.log(c.dim("Suggested annotations (not auto-applied):"))
    console.log(c.dim("  - run `bun npm-registry audit` after each release"))
    console.log(c.dim("  - drift means npm-packages.md needs the new version bumped"))
    console.log(c.dim("  - missing entries should be added to the relevant section"))
  }
}

async function cmdPlaceholders(): Promise<void> {
  console.log(c.bold(`\nKnown placeholders (${PLACEHOLDERS.length}):\n`))
  for (const name of PLACEHOLDERS) {
    const meta = await fetchPackageMeta(name)
    if (!meta) {
      console.log(`  ${pad(name, 28)} ${c.dim("not on registry")}`)
      continue
    }
    const dep = deprecationOf(meta)
    const ver = latestVersion(meta)
    const status = dep ? c.green("deprecated") : c.red("ACTIVE — needs deprecation")
    console.log(`  ${pad(name, 28)} v${pad(ver, 8)} ${status}`)
  }
  console.log()
}

async function cmdRenamed(): Promise<void> {
  console.log(c.bold(`\nKnown renamed/superseded (${RENAMED.length}):\n`))
  for (const { from, to } of RENAMED) {
    const meta = await fetchPackageMeta(from)
    if (!meta) {
      console.log(`  ${pad(from, 28)} → ${pad(to, 22)} ${c.dim("not on registry")}`)
      continue
    }
    const dep = deprecationOf(meta)
    const correctRedirect = dep && dep.toLowerCase().includes(to.toLowerCase())
    let status: string
    if (!dep) status = c.red("ACTIVE — needs deprecation")
    else if (correctRedirect) status = c.green("deprecated → " + to)
    else status = c.yellow("deprecated but msg doesn't mention " + to)
    console.log(`  ${pad(from, 28)} → ${pad(to, 22)} ${status}`)
  }
  console.log()
}

async function cmdDeprecate(name: string, msg: string): Promise<void> {
  if (!name || !msg) { console.error("usage: deprecate <pkg> \"<message>\""); process.exit(2) }
  console.log(c.yellow(`About to run: npm deprecate "${name}@*" "${msg}"`))
  console.log(c.dim("This will affect ALL versions of the package."))
  if (process.stdin.isTTY) {
    process.stdout.write("Type 'yes' to confirm: ")
    const answer = await readLine()
    if (answer.trim().toLowerCase() !== "yes") {
      console.log(c.dim("aborted"))
      return
    }
  } else {
    console.log(c.dim("non-interactive: pass DEPRECATE_CONFIRM=1 to actually run"))
    if (process.env.DEPRECATE_CONFIRM !== "1") return
  }
  const r = spawnSync("npm", ["deprecate", `${name}@*`, msg], { stdio: "inherit" })
  if (r.status !== 0) process.exit(r.status ?? 1)
  console.log(c.green(`✓ deprecated ${name}`))
  appendLog(`deprecate ${name} :: ${msg}`)
}

async function cmdUndeprecate(name: string): Promise<void> {
  if (!name) { console.error("usage: undeprecate <pkg>"); process.exit(2) }
  console.log(c.yellow(`About to clear deprecation: npm deprecate "${name}@*" ""`))
  if (process.stdin.isTTY) {
    process.stdout.write("Type 'yes' to confirm: ")
    const answer = await readLine()
    if (answer.trim().toLowerCase() !== "yes") {
      console.log(c.dim("aborted"))
      return
    }
  } else {
    if (process.env.DEPRECATE_CONFIRM !== "1") {
      console.log(c.dim("non-interactive: pass DEPRECATE_CONFIRM=1 to actually run"))
      return
    }
  }
  const r = spawnSync("npm", ["deprecate", `${name}@*`, ""], { stdio: "inherit" })
  if (r.status !== 0) process.exit(r.status ?? 1)
  console.log(c.green(`✓ undeprecated ${name}`))
  appendLog(`undeprecate ${name}`)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length)
}

async function readLine(): Promise<string> {
  return new Promise((resolve) => {
    let buf = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => {
      buf += chunk
      if (buf.includes("\n")) { process.stdin.pause(); resolve(buf) }
    })
  })
}

function appendLog(msg: string): void {
  const line = `${new Date().toISOString()} ${msg}\n`
  try {
    const path = "/tmp/.npm-registry.log"
    const prev = existsSync(path) ? readFileSync(path, "utf8") : ""
    writeFileSync(path, prev + line)
  } catch { /* ignore */ }
}

interface ParsedRegistry {
  size: number
  has(name: string): boolean
  get(name: string): string | undefined
  keys(): IterableIterator<string>
  entries(): IterableIterator<[string, string]>
  deprecated: Set<string>
}

function parseRegistryMd(): ParsedRegistry {
  const text = readFileSync(REGISTRY_MD, "utf8")
  const versions = new Map<string, string>()
  const deprecated = new Set<string>()
  let inDeprecatedSection = false

  const lines = text.split("\n")
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      inDeprecatedSection = /Deprecated/i.test(line) || /Renamed/i.test(line)
    }
    // Match table row: | `pkg` | rest |
    const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|/)
    if (m) {
      const name = m[1].trim()
      const rawVer = m[2].trim()
      // Tracked in md regardless of whether the row carries a version.
      // Reservation tables only list name + notes, so version is "".
      const verMatch = rawVer.match(/^(\d+\.\d+\.\d+)/)
      versions.set(name, verMatch ? verMatch[1] : "")
      if (inDeprecatedSection) deprecated.add(name)
    }
  }
  return {
    get size() { return versions.size },
    has: (n) => versions.has(n),
    get: (n) => versions.get(n),
    keys: () => versions.keys(),
    entries: () => versions.entries(),
    deprecated,
  }
}

// ─── Entry point ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [, , cmd, ...args] = process.argv
  switch (cmd) {
    case "list": await cmdList(); break
    case "status": await cmdStatus(args[0]); break
    case "audit": await cmdAudit(); break
    case "placeholders": await cmdPlaceholders(); break
    case "renamed": await cmdRenamed(); break
    case "deprecate": await cmdDeprecate(args[0], args.slice(1).join(" ")); break
    case "undeprecate": await cmdUndeprecate(args[0]); break
    default:
      console.log(`npm-registry — query and manage packages by maintainer ${MAINTAINER}

Usage:
  bun npm-registry list                       all packages by maintainer
  bun npm-registry status <pkg>               package detail
  bun npm-registry audit                      cross-check md vs live registry
  bun npm-registry placeholders               known stale placeholders
  bun npm-registry renamed                    known renamed/superseded
  bun npm-registry deprecate <pkg> "<msg>"    npm deprecate (asks confirmation)
  bun npm-registry undeprecate <pkg>          clear deprecation

Cache: ${CACHE_FILE} (5-min TTL). Delete to force refresh.
Log:   /tmp/.npm-registry.log (deprecate/undeprecate actions)
`)
      process.exit(cmd ? 2 : 0)
  }
}

main().catch((e) => { console.error(c.red(String(e))); process.exit(1) })
