import { execFileSync } from "node:child_process"
import type { Credential, QuotaInfo, QuotaProvider, QuotaWindow } from "../types.ts"

const MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models"
const SERVICE_USAGE_URL =
  "https://serviceusage.googleapis.com/v1beta1/projects/{project}/services/generativelanguage.googleapis.com/consumerQuotaMetrics?view=FULL"

function extractApiKey(credential: Credential): string | undefined {
  const key = credential.apiKey as string | undefined
  return key && key.length > 0 ? key : undefined
}

function googleCloudProject(): string | undefined {
  return (
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_PROJECT_ID ||
    process.env.GCP_PROJECT
  )
}

function googleAccessToken(): string | undefined {
  const envToken = process.env.GOOGLE_CLOUD_ACCESS_TOKEN || process.env.GOOGLE_ACCESS_TOKEN
  if (envToken && envToken.length > 0) return envToken
  try {
    const token = execFileSync("gcloud", ["auth", "print-access-token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    }).trim()
    return token.length > 0 ? token : undefined
  } catch {
    return undefined
  }
}

function quotaName(metric: string, unit: string): string | null {
  const lower = metric.toLowerCase()
  const isToken = /token|character/.test(lower)
  const isRequest = /request/.test(lower)
  const isMinute = /\/(?:min|minute)\b/.test(unit)
  const isDay = /\/(?:d|day)\b/.test(unit)
  if (isToken && isMinute) return "TPM"
  if (isToken && isDay) return "TPD"
  if (isRequest && isMinute) return "RPM"
  if (isRequest && isDay) return "RPD"
  return null
}

function effectiveLimitValue(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw !== "string") return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

function parseServiceUsageWindows(raw: unknown): QuotaWindow[] {
  if (typeof raw !== "object" || raw === null) return []
  const metrics = (raw as { metrics?: unknown }).metrics
  if (!Array.isArray(metrics)) return []
  const byName = new Map<string, QuotaWindow>()
  for (const metric of metrics) {
    if (typeof metric !== "object" || metric === null) continue
    const metricName = (metric as { metric?: unknown }).metric
    if (typeof metricName !== "string" || !metricName.startsWith("generativelanguage.googleapis.com/")) continue
    const limits = (metric as { consumerQuotaLimits?: unknown }).consumerQuotaLimits
    if (!Array.isArray(limits)) continue
    for (const limit of limits) {
      if (typeof limit !== "object" || limit === null) continue
      const row = limit as { unit?: unknown; effectiveLimit?: unknown }
      const unit = typeof row.unit === "string" ? row.unit : ""
      const name = quotaName(metricName, unit)
      const value = effectiveLimitValue(row.effectiveLimit)
      if (!name || !value) continue
      const existing = byName.get(name)
      if (!existing || (existing.limit ?? 0) < value) {
        byName.set(name, { name, utilization: 0, limit: value })
      }
    }
  }
  const order = new Map([
    ["RPM", 0],
    ["TPM", 1],
    ["RPD", 2],
    ["TPD", 3],
  ])
  return Array.from(byName.values()).sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99))
}

async function fetchGoogleCloudQuotaWindows(): Promise<{ project?: string; windows: QuotaWindow[] }> {
  const project = googleCloudProject()
  if (!project) return { windows: [] }
  const token = googleAccessToken()
  if (!token) return { project, windows: [] }
  const url = SERVICE_USAGE_URL.replace("{project}", encodeURIComponent(project))
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!resp.ok) return { project, windows: [] }
  return { project, windows: parseServiceUsageWindows(await resp.json()) }
}

/** Google/Gemini provider — validates key via models list endpoint */
export function createGoogleProvider(): QuotaProvider {
  return {
    providerType: "google",

    validateCredential(credential: Credential): boolean {
      return extractApiKey(credential) !== undefined
    },

    async checkQuota(credential: Credential): Promise<QuotaInfo> {
      const base: Pick<QuotaInfo, "accountName" | "provider" | "checkedAt"> = {
        accountName: "",
        provider: "google",
        checkedAt: Date.now(),
      }

      const apiKey = extractApiKey(credential)
      if (!apiKey) {
        return { ...base, available: false, windows: [], error: "No API key found" }
      }

      try {
        const resp = await fetch(`${MODELS_URL}?key=${apiKey}&pageSize=1`)

        if (resp.status === 400 || resp.status === 403) {
          return { ...base, available: false, windows: [], error: "Invalid API key" }
        }
        if (!resp.ok) {
          return { ...base, available: false, windows: [], error: `HTTP ${resp.status}` }
        }

        const cloudQuota = await fetchGoogleCloudQuotaWindows()
        return {
          ...base,
          available: true,
          windows: cloudQuota.windows,
          metadata: cloudQuota.project ? { googleCloudProject: cloudQuota.project } : undefined,
        }
      } catch (err) {
        return {
          ...base,
          available: false,
          windows: [],
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }
}
