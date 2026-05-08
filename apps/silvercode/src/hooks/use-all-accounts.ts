/**
 * React hook — list every accountly account + its quota/status, with a
 * 2-minute disk-backed cache and periodic refresh.
 *
 * Consumed by the side panel to render one panel per known account.
 * Refresh cadence matches the cache TTL so users
 * see fresh data without hammering provider endpoints on every
 * silvercode spawn.
 */

import { useEffect, useState } from "react"
import { createScope } from "@silvery/scope"
import {
  type AccountSummary,
  type AllAccountsFactory,
  probeAllAccounts,
  readAllAccountsCacheSync,
} from "../account-status.ts"

const REFRESH_MS = 2 * 60 * 1000

export function useAllAccounts(factory?: AllAccountsFactory): AccountSummary[] {
  const [state, setState] = useState<AccountSummary[]>(
    () => (factory ? factory.readCached() : readAllAccountsCacheSync({ allowStale: true })) ?? [],
  )

  useEffect(() => {
    const scope = createScope("all-accounts")
    let cancelled = false
    async function refresh(): Promise<void> {
      const next = factory ? await factory.probe() : await probeAllAccounts()
      if (!cancelled) setState(next)
    }
    void refresh()
    scope.interval(() => void refresh(), REFRESH_MS)
    return () => {
      cancelled = true
      void scope[Symbol.asyncDispose]()
    }
  }, [factory])

  return state
}
