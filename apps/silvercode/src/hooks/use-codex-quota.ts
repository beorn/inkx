import { useEffect, useState } from "react"
import { probeCodexQuota, readCodexQuotaSync, type CodexQuotaSnapshot } from "../codex-quota.ts"

const REFRESH_MS = 120_000

export function useCodexQuota(enabled: boolean): CodexQuotaSnapshot | null {
  const [state, setState] = useState<CodexQuotaSnapshot | null>(() => (enabled ? readCodexQuotaSync() : null))

  useEffect(() => {
    if (!enabled) {
      setState(null)
      return
    }
    let cancelled = false
    async function refresh(): Promise<void> {
      const next = await probeCodexQuota()
      if (!cancelled) setState(next)
    }
    void refresh()
    const id = setInterval(() => void refresh(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [enabled])

  return state
}
