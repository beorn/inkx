/**
 * Context window sizing for Claude models.
 *
 * Maps a model identifier (as surfaced by the Claude stream-json init event,
 * e.g. "claude-sonnet-4-6") to its documented context window in tokens.
 * All current public Claude models ship with a 200K context window — the
 * map exists so unknown-but-new models still get a sensible default, and
 * so future long-context variants (e.g. 1M-token tiers) can be added
 * without touching every call site.
 */

const DEFAULT_WINDOW = 200_000

const WINDOWS: Array<{ prefix: string; tokens: number }> = [
  { prefix: "claude-opus-", tokens: 200_000 },
  { prefix: "claude-sonnet-", tokens: 200_000 },
  { prefix: "claude-haiku-", tokens: 200_000 },
]

/**
 * Resolve the context-window size (in tokens) for a given model name.
 * Special-case the `[1m]` variant which indicates a 1M-token tier.
 * Returns DEFAULT_WINDOW (200K) for unknown or empty models.
 */
export function contextWindowFor(model: string | null | undefined): number {
  if (!model) return DEFAULT_WINDOW
  if (model.includes("[1m]")) return 1_000_000
  for (const { prefix, tokens } of WINDOWS) {
    if (model.startsWith(prefix)) return tokens
  }
  return DEFAULT_WINDOW
}

/**
 * Humanize a model slug for display. `claude-opus-4-7` → "Opus 4.7";
 * `claude-opus-4-7[1m]` → "Opus 4.7 (1M context)"; dated builds like
 * `claude-haiku-4-5-20251001` drop the trailing YYYYMMDD. Unknown slugs
 * fall through.
 */
export function modelLabel(model: string | null | undefined): string {
  if (!model) return ""
  const big = model.includes("[1m]") ? " (1M context)" : ""
  const slug = model.replace(/\[1m\]$/, "")
  const m = slug.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)(?:-\d{8})?$/)
  if (m) {
    const family = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1)
    return `${family} ${m[2]}.${m[3]}${big}`
  }
  return slug + big
}

/** Threshold colors for context utilization. Tuned so /compact is suggested early. */
export type ContextUtilizationLevel = "ok" | "warn" | "critical"

export function contextUtilizationLevel(percent: number): ContextUtilizationLevel {
  if (percent >= 90) return "critical"
  if (percent >= 70) return "warn"
  return "ok"
}

export function contextUtilizationColor(level: ContextUtilizationLevel): string {
  switch (level) {
    case "critical":
      return "$error"
    case "warn":
      return "$warning"
    case "ok":
      return "$muted"
  }
}

/**
 * Format a context-utilization summary for the status line.
 * Example: { totalTokens: 7000, window: 200000 } → "ctx: 7K / 200K (3%)"
 */
export function formatContextUtilization(totalTokens: number, windowTokens: number): string {
  const totalK = Math.round(totalTokens / 1000)
  const windowK = Math.round(windowTokens / 1000)
  const percent = contextUtilizationPercent(totalTokens, windowTokens)
  return `ctx: ${totalK}K / ${windowK}K (${percent}%)`
}

/**
 * Compute used-percentage for a given token count + window. Floor-based
 * so a user who's burned 3.5% of their window reads "3%" — rounding up
 * misleads users into thinking they're closer to /compact than they are.
 */
export function contextUtilizationPercent(totalTokens: number, windowTokens: number): number {
  if (windowTokens <= 0) return 0
  return Math.floor((totalTokens / windowTokens) * 100)
}
