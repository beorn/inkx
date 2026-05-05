import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import type { AccountStatus } from "../account-status.ts"
import type { QuotaWindow } from "../types.ts"

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
  accountId: string | null
  updatedAt: string | null
  sourcePath: string | null
  limits: CodexQuotaLimit[]
}

type RawRateLimitWindow = {
  used_percent?: unknown
  window_minutes?: unknown
  resets_at?: unknown
}

function userHome(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? ""
}

function codexSessionsRoot(): string {
  return join(userHome(), ".codex", "sessions")
}

type CodexAuthAccount = {
  label: string | null
  accountId: string | null
}

function parseCodexAuthAccount(raw: string): CodexAuthAccount {
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const tokens = typeof parsed.tokens === "object" && parsed.tokens !== null ? (parsed.tokens as Record<string, unknown>) : {}
  const idToken = typeof tokens.id_token === "string" ? tokens.id_token : ""
  const accountId = typeof tokens.account_id === "string" ? tokens.account_id : null
  const email = emailFromJwt(idToken) ?? raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null
  return { label: email, accountId }
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
    ...readCodexAuthAccount(),
    updatedAt,
    sourcePath,
    limits,
  }
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

function readCodexAuthAccount(): CodexAuthAccount {
  const authPath = join(userHome(), ".codex", "auth.json")
  try {
    return parseCodexAuthAccount(readFileSync(authPath, "utf8"))
  } catch {
    return { label: null, accountId: null }
  }
}

function emailFromJwt(jwt: string): string | null {
  const payload = jwt.split(".")[1]
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>
    return typeof parsed.email === "string" ? parsed.email : null
  } catch {
    return null
  }
}

export function readLatestCodexQuotaFromDisk(): CodexQuotaSnapshot | null {
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

function codexWindowName(minutes: number): string {
  if (minutes === 300) return "5-hour"
  if (minutes === 10080) return "7-day"
  if (minutes % 60 === 0) return `${minutes / 60}-hour`
  return `${minutes}-minute`
}

export function codexSubscriptionStatuses(snapshot = readLatestCodexQuotaFromDisk()): AccountStatus[] {
  if (!snapshot) return []
  return snapshot.limits.map((limit, index) => {
    const quotas: QuotaWindow[] = [limit.primary, limit.secondary].flatMap((w) =>
      w
        ? [
            {
              name: codexWindowName(w.windowMinutes),
              utilization: w.usedPercent,
              resetsAt: w.resetsAt ?? undefined,
            },
          ]
        : [],
    )
    return {
      kind: "api-key",
      name: limit.label === "Codex" ? (snapshot.accountLabel ?? "ChatGPT subscription") : limit.label,
      label: "Codex",
      provider: "openai",
      email: limit.label === "Codex" ? (snapshot.accountLabel ?? undefined) : undefined,
      plan: limit.planType ?? undefined,
      current: index === 0,
      default: false,
      stock: false,
      available: true,
      quotas,
      quota: {
        accountName: snapshot.accountLabel ?? "codex",
        provider: "openai",
        available: true,
        windows: quotas,
        checkedAt: snapshot.updatedAt ? Date.parse(snapshot.updatedAt) : Date.now(),
        metadata: {
          ...(limit.planType ? { planType: limit.planType } : {}),
          ...(snapshot.accountId ? { accountId: snapshot.accountId } : {}),
          ...(snapshot.updatedAt ? { updatedAt: snapshot.updatedAt } : {}),
          ...(snapshot.sourcePath ? { sourcePath: snapshot.sourcePath } : {}),
        },
      },
    }
  })
}
