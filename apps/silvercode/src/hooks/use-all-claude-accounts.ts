/**
 * React hook — list every accountly profile + their quotas, with a
 * 5-minute disk-backed cache and periodic refresh.
 *
 * Consumed by the side panel to render one account panel per profile
 * (active + inactive). Refresh cadence matches the cache TTL so users
 * see fresh data without hammering Anthropic's /api/usage on every
 * silvercode spawn.
 */

import { useEffect, useState } from "react"
import {
  type AccountSummary,
  type AllAccountsFactory,
  probeAllAccounts,
  readAllAccountsCacheSync,
} from "../claude-accounts.ts"

const REFRESH_MS = 5 * 60 * 1000

export function useAllClaudeAccounts(factory?: AllAccountsFactory): AccountSummary[] {
  const [state, setState] = useState<AccountSummary[]>(
    () => (factory ? factory.readCached() : readAllAccountsCacheSync()) ?? [],
  )

  useEffect(() => {
    let cancelled = false
    async function refresh(): Promise<void> {
      const next = factory ? await factory.probe() : await probeAllAccounts()
      if (!cancelled) setState(next)
    }
    void refresh()
    const id = setInterval(() => void refresh(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [factory])

  return state
}
