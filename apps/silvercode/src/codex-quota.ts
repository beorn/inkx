import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { codexSessionsRoot, userHome } from "@km/config/paths"

export type CodexQuotaWindow = {
  usedPercent: number
  windowMinutes: number
  resetsAt: string | null
}

export type CodexQuotaLimit = {
  id: string
  label: string
  planType: string | null
  primary: CodexQuotaWindow | null
  secondary: CodexQuotaWindow | null
}

export type CodexQuotaSnapshot = {
  accountLabel: string | null
  updatedAt: string | null
  sourcePath: string | null
  limits: CodexQuotaLimit[]
}

export interface CodexQuotaFactory {
  readCached(): CodexQuotaSnapshot | null
  probe(): Promise<CodexQuotaSnapshot | null>
}

let factoryOverride: CodexQuotaFactory | null = null

export function setCodexQuotaFactoryOverride(factory: CodexQuotaFactory | null): void {
  factoryOverride = factory
}

export function readCodexQuotaSync(): CodexQuotaSnapshot | null {
  if (factoryOverride) return factoryOverride.readCached()
  return readLatestCodexQuotaFromDisk()
}

export async function probeCodexQuota(): Promise<CodexQuotaSnapshot | null> {
  if (factoryOverride) return factoryOverride.probe()
  return readLatestCodexQuotaFromDisk()
}

type RawRateLimitWindow = {
  used_percent?: unknown
  window_minutes?: unknown
  resets_at?: unknown
}

function parseWindow(raw: unknown): CodexQuotaWindow | null {
  if (typeof raw !== "object" || raw === null) return null
  const w = raw as RawRateLimitWindow
  if (typeof w.used_percent !== "number" || typeof w.window_minutes !== "number") return null
  const resetsAt = typeof w.resets_at === "number" ? new Date(w.resets_at * 1000).toISOString() : null
  return {
    usedPercent: Math.max(0, Math.min(100, w.used_percent)),
    windowMinutes: w.window_minutes,
    resetsAt,
  }
}

function limitLabel(id: string, explicit: unknown): string {
  if (typeof explicit === "string" && explicit.trim().length > 0) return explicit.trim()
  if (id === "codex") return "Codex"
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ")
}

function extractRateLimit(raw: unknown): CodexQuotaLimit | null {
  if (typeof raw !== "object" || raw === null) return null
  const r = raw as Record<string, unknown>
  const id = typeof r.limit_id === "string" && r.limit_id.length > 0 ? r.limit_id : "codex"
  const primary = parseWindow(r.primary)
  const secondary = parseWindow(r.secondary)
  if (!primary && !secondary) return null
  return {
    id,
    label: limitLabel(id, r.limit_name),
    planType: typeof r.plan_type === "string" ? r.plan_type : null,
    primary,
    secondary,
  }
}

export function parseCodexQuotaJsonl(raw: string, sourcePath: string | null = null): CodexQuotaSnapshot | null {
  const latestById = new Map<string, CodexQuotaLimit>()
  let updatedAt: string | null = null

  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof parsed !== "object" || parsed === null) continue
    const row = parsed as Record<string, unknown>
    if (row.type !== "event_msg") continue
    const payload = row.payload
    if (typeof payload !== "object" || payload === null) continue
    const p = payload as Record<string, unknown>
    if (p.type !== "token_count") continue
    const limit = extractRateLimit(p.rate_limits)
    if (!limit) continue
    latestById.set(limit.id, limit)
    updatedAt = typeof row.timestamp === "string" ? row.timestamp : updatedAt
  }

  const limits = Array.from(latestById.values())
  if (limits.length === 0) return null
  return {
    accountLabel: readCodexAccountLabel(),
    updatedAt,
    sourcePath,
    limits,
  }
}

function readLatestCodexQuotaFromDisk(): CodexQuotaSnapshot | null {
  const files = latestRolloutFiles(codexSessionsRoot()).slice(0, 20)
  for (const file of files) {
    try {
      const parsed = parseCodexQuotaJsonl(readFileSync(file, "utf8"), file)
      if (parsed) return parsed
    } catch {
      continue
    }
  }
  return null
}

function latestRolloutFiles(root: string): string[] {
  const files: Array<{ path: string; mtimeMs: number }> = []
  const visit = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry)
      let stat
      try {
        stat = statSync(path)
      } catch {
        continue
      }
      if (stat.isDirectory()) visit(path)
      else if (entry.startsWith("rollout-") && entry.endsWith(".jsonl")) files.push({ path, mtimeMs: stat.mtimeMs })
    }
  }
  visit(root)
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs).map((f) => f.path)
}

function readCodexAccountLabel(): string | null {
  const authPath = join(userHome(), ".codex", "auth.json")
  try {
    const raw = readFileSync(authPath, "utf8")
    const match = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    return match?.[0] ?? null
  } catch {
    return null
  }
}
