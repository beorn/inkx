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
 * Returns DEFAULT_WINDOW (200K) for unknown or empty models.
 */
export function contextWindowFor(model: string | null | undefined): number {
  if (!model) return DEFAULT_WINDOW
  for (const { prefix, tokens } of WINDOWS) {
    if (model.startsWith(prefix)) return tokens
  }
  return DEFAULT_WINDOW
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
  const percent = windowTokens > 0 ? Math.round((totalTokens / windowTokens) * 100) : 0
  return `ctx: ${totalK}K / ${windowK}K (${percent}%)`
}
