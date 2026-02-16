import pc from "picocolors"
import type { AccountConfig, QuotaInfo, QuotaWindow } from "./types.ts"

/** Format a utilization bar: ██████░░░░ */
function formatBar(utilization: number, width = 10): string {
  const filled = Math.round((utilization / 100) * width)
  const empty = width - filled
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(empty)

  if (utilization >= 100) return pc.red(bar)
  if (utilization >= 80) return pc.yellow(bar)
  return pc.green(bar)
}

/** Format time until reset: "2h14m", "0h52m", "4d" */
function formatResetTime(resetsAt: string | undefined): string {
  if (!resetsAt) return ""
  const ms = new Date(resetsAt).getTime() - Date.now()
  if (ms <= 0) return "now"

  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)

  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days}d`
  }
  return `${hours}h${String(minutes).padStart(2, "0")}m`
}

/** Collect the union of window names across all quotas, in consistent order */
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

/** Format a single window cell: "██████░░░░  60%  2h14m" */
function formatWindowCell(w: QuotaWindow | undefined, cellWidth: number): string {
  if (!w) return " ".repeat(cellWidth)
  const bar = formatBar(w.utilization)
  const pct = `${String(w.utilization).padStart(3)}%`
  const reset = w.resetsAt ? formatResetTime(w.resetsAt).padStart(6) : "      "
  const cell = `${bar} ${pct} ${reset}`
  return cell
}

/** Format a full quota line for one account */
export function formatAccountLine(
  quota: QuotaInfo,
  isActive: boolean,
  nameWidth: number,
  windowNames: string[],
  account?: AccountConfig,
): string {
  const marker = isActive ? pc.green("*") : " "
  const name = quota.accountName.padEnd(nameWidth)
  const plan = account?.metadata?.plan ?? ""
  const planCol = plan ? pc.dim(plan.padEnd(12)) : " ".repeat(12)

  if (quota.error) {
    return `${marker} ${name}  ${planCol}  ${pc.red(quota.error)}`
  }

  if (quota.windows.length === 0) {
    return `${marker} ${name}  ${planCol}  ${pc.dim("no quota data")}`
  }

  const windowMap = new Map<string, QuotaWindow>()
  for (const w of quota.windows) windowMap.set(w.name, w)

  const cells = windowNames.map((wn) => formatWindowCell(windowMap.get(wn), 22))
  return `${marker} ${name}  ${planCol}  ${cells.join("  ")}`
}

/** Format the full status dashboard as a table */
export function formatStatus(
  quotas: QuotaInfo[],
  activeAccount: string | undefined,
  accounts?: AccountConfig[],
): string {
  if (quotas.length === 0) {
    return pc.dim("No accounts configured. Run: accountly import")
  }

  const accountMap = new Map<string, AccountConfig>()
  for (const a of accounts ?? []) accountMap.set(a.name, a)

  // Group by provider
  const grouped = new Map<string, QuotaInfo[]>()
  for (const q of quotas) {
    const list = grouped.get(q.provider) ?? []
    list.push(q)
    grouped.set(q.provider, list)
  }

  const lines: string[] = []

  for (const [provider, providerQuotas] of grouped) {
    const nameWidth = Math.max(...providerQuotas.map((q) => q.accountName.length))
    const windowNames = collectWindowNames(providerQuotas)

    // Header
    lines.push(pc.dim(providerLabel(provider)))
    const headerName = "ACCOUNT".padEnd(nameWidth)
    const headerPlan = "PLAN".padEnd(12)
    const headerWindows = windowNames.map((n) => pc.dim(n.padEnd(22))).join("  ")
    lines.push(pc.dim(`  ${headerName}  ${headerPlan}  ${headerWindows}`))

    // Rows
    for (const q of providerQuotas) {
      const account = accountMap.get(q.accountName)
      lines.push(formatAccountLine(q, q.accountName === activeAccount, nameWidth, windowNames, account))
    }
  }

  return lines.join("\n")
}

function providerLabel(provider: string): string {
  const labels: Record<string, string> = {
    "claude-oauth": "Claude Code (OAuth)",
    "anthropic-api": "Anthropic (API Key)",
    openai: "OpenAI",
    google: "Google (Gemini)",
  }
  return labels[provider] ?? provider
}
