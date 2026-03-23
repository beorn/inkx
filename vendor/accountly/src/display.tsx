import React from "react"
import { renderString } from "@silvery/ag-react"
import { Box, Text } from "@silvery/ag-react"
import type { AccountConfig, QuotaInfo, QuotaWindow } from "./types.ts"

// ── Helpers ─────────────────────────────────────────────────────────────

function formatBar(utilization: number, width = 10): string {
  const filled = Math.round((utilization / 100) * width)
  const empty = width - filled
  return "\u2588".repeat(filled) + "\u2591".repeat(empty)
}

function barColor(utilization: number): string {
  if (utilization >= 100) return "red"
  if (utilization >= 80) return "yellow"
  return "green"
}

function formatResetTime(resetsAt: string | undefined): string {
  if (!resetsAt) return ""
  const date = new Date(resetsAt)
  if (!isNaN(date.getTime())) {
    const ms = date.getTime() - Date.now()
    if (ms <= 5_000) return ""
    return formatDuration(ms)
  }
  const match = resetsAt.match(/(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?/)
  if (match && (match[1] || match[2])) {
    const mins = Number(match[1] ?? 0)
    const secs = Number(match[2] ?? 0)
    const ms = (mins * 60 + secs) * 1000
    if (ms <= 5_000) return ""
    return formatDuration(ms)
  }
  return ""
}

function formatDuration(ms: number): string {
  if (ms <= 0) return ""
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (hours >= 24) return `${Math.floor(hours / 24)}d`
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}m`
  return `${minutes}m`
}

function collectWindowNames(quotas: QuotaInfo[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const q of quotas) {
    for (const w of q.windows) {
      if (!seen.has(w.name)) {
        seen.add(w.name)
        names.push(w.name)
      }
    }
  }
  return names
}

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    "claude-oauth": "Claude Code (OAuth)",
    "anthropic-api": "Anthropic (API Key)",
    openai: "OpenAI",
    xai: "xAI (Grok)",
    google: "Google (Gemini)",
    openrouter: "OpenRouter",
  }
  return labels[provider] ?? provider
}

// ── Layout ──────────────────────────────────────────────────────────────

interface RowData {
  name: string
  isActive: boolean
  plan: string
  windows: Map<string, QuotaWindow>
  error?: string
  hasWindows: boolean
}

/** Compute left-column width for a single provider group */
function computeLeftWidth(provider: string, rows: RowData[]): number {
  let w = providerLabel(provider).length
  for (const r of rows) {
    const entry = r.name + (r.isActive ? " *" : "") + (r.plan ? ` ${r.plan}` : "")
    w = Math.max(w, entry.length)
  }
  return w
}

interface WindowMetrics {
  pctW: number
  resetW: number
}

function computeWindowMetrics(rows: RowData[], wn: string): WindowMetrics {
  let pctW = 0
  let resetW = 0
  for (const r of rows) {
    const w = r.windows.get(wn)
    if (!w) continue
    pctW = Math.max(pctW, `${w.utilization}%`.length)
    resetW = Math.max(resetW, formatResetTime(w.resetsAt).length)
  }
  return { pctW, resetW }
}

// ── Components ──────────────────────────────────────────────────────────

function ProviderGroup({
  provider,
  rows,
  windowNames,
  leftW,
}: {
  provider: string
  rows: RowData[]
  windowNames: string[]
  leftW: number
}) {
  const hasQuotaData = windowNames.length > 0 || rows.some((r) => r.error || !r.hasWindows)

  const metrics = new Map<string, WindowMetrics>()
  for (const wn of windowNames) metrics.set(wn, computeWindowMetrics(rows, wn))

  return (
    <Box flexDirection="row">
      {/* Left: name + plan (shared width across groups) */}
      <Box flexDirection="column" width={leftW} flexShrink={0}>
        <Text bold>{providerLabel(provider)}</Text>
        {rows.map((r) => (
          <Box key={r.name} flexDirection="row">
            <Text>{r.name}</Text>
            {r.isActive && <Text color="green"> *</Text>}
            {r.plan && <Text dimColor> {r.plan}</Text>}
          </Box>
        ))}
      </Box>

      {/* Window columns — per group, flex-sized */}
      {windowNames.length > 0 ? (
        windowNames.map((wn) => {
          const m = metrics.get(wn)!
          return (
            <React.Fragment key={wn}>
              <Box flexDirection="column" flexShrink={0}>
                <Text dimColor> │ </Text>
                {rows.map((r) => (
                  <Text key={r.name} dimColor>
                    {" "}
                    │{" "}
                  </Text>
                ))}
              </Box>
              <Box flexDirection="column" flexShrink={0}>
                <Text dimColor>{wn}</Text>
                {rows.map((r) => {
                  const w = r.windows.get(wn)
                  if (!w) return <Text key={r.name}> </Text>
                  const pct = `${w.utilization}%`.padStart(m.pctW)
                  const reset = formatResetTime(w.resetsAt)
                  const resetStr = m.resetW > 0 ? ` ${reset.padEnd(m.resetW)}` : ""
                  return (
                    <Text key={r.name}>
                      <Text color={barColor(w.utilization)}>{formatBar(w.utilization)}</Text>
                      <Text>
                        {" "}
                        {pct}
                        {resetStr}
                      </Text>
                    </Text>
                  )
                })}
              </Box>
            </React.Fragment>
          )
        })
      ) : hasQuotaData ? (
        <>
          <Box flexDirection="column" flexShrink={0}>
            <Text> </Text>
            {rows.map((r) => (
              <Text key={r.name} dimColor>
                {" "}
                │{" "}
              </Text>
            ))}
          </Box>
          <Box flexDirection="column" flexShrink={0}>
            <Text> </Text>
            {rows.map((r) => {
              if (r.error)
                return (
                  <Text key={r.name} color="red">
                    {r.error}
                  </Text>
                )
              if (!r.hasWindows)
                return (
                  <Text key={r.name} color="green">
                    {"\u2713"} key valid
                  </Text>
                )
              return <Text key={r.name}> </Text>
            })}
          </Box>
        </>
      ) : null}
    </Box>
  )
}

function StatusTable({
  quotas,
  activeAccount,
  accounts,
}: {
  quotas: QuotaInfo[]
  activeAccount: string | undefined
  accounts: AccountConfig[]
}) {
  if (quotas.length === 0) {
    return <Text dimColor>No accounts configured. Run: accountly import</Text>
  }

  const accountMap = new Map<string, AccountConfig>()
  for (const a of accounts) accountMap.set(a.name, a)

  const grouped = new Map<string, QuotaInfo[]>()
  for (const q of quotas) {
    const list = grouped.get(q.provider) ?? []
    list.push(q)
    grouped.set(q.provider, list)
  }

  return (
    <Box flexDirection="column" gap={1}>
      {[...grouped.entries()].map(([provider, providerQuotas]) => {
        const windowNames = collectWindowNames(providerQuotas)
        const rows: RowData[] = providerQuotas.map((q) => {
          const windowMap = new Map<string, QuotaWindow>()
          for (const w of q.windows) windowMap.set(w.name, w)
          return {
            name: q.accountName,
            isActive: q.accountName === activeAccount,
            plan: accountMap.get(q.accountName)?.metadata?.plan ?? "",
            windows: windowMap,
            error: q.error,
            hasWindows: q.windows.length > 0,
          }
        })
        const leftW = computeLeftWidth(provider, rows)
        return <ProviderGroup key={provider} provider={provider} rows={rows} windowNames={windowNames} leftW={leftW} />
      })}
    </Box>
  )
}

// ── Public API ──────────────────────────────────────────────────────────

export async function formatStatus(
  quotas: QuotaInfo[],
  activeAccount: string | undefined,
  accounts?: AccountConfig[],
): Promise<string> {
  return renderString(<StatusTable quotas={quotas} activeAccount={activeAccount} accounts={accounts ?? []} />, {
    width: process.stdout.columns || 200,
  })
}

/** @deprecated Kept for backwards compat */
export function formatAccountLine(
  quota: QuotaInfo,
  _isActive: boolean,
  _nameWidth: number,
  _windowNames: string[],
  _account?: AccountConfig,
): string {
  return quota.accountName
}
