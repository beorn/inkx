import type { QuotaInfo } from "./types.ts"
import type { DiscoveredAccount } from "./discover.ts"
import { getProvider } from "./providers/index.ts"

/** Check quota for a single discovered account */
export async function checkAccountQuota(discovered: DiscoveredAccount): Promise<QuotaInfo> {
  const provider = getProvider(discovered.config.provider)
  const result = await provider.checkQuota(discovered.credential)
  result.accountName = discovered.config.name
  return result
}

/** Check quota for all discovered accounts in parallel */
export async function checkAllQuotas(accounts: DiscoveredAccount[]): Promise<QuotaInfo[]> {
  const enabled = accounts.filter((a) => !a.config.disabled)
  return Promise.all(enabled.map(checkAccountQuota))
}

/** Find the account with the most remaining capacity */
export function findBestAccount(quotas: QuotaInfo[]): QuotaInfo | undefined {
  const available = quotas.filter((q) => q.available && !q.error)
  if (available.length === 0) return undefined

  // Score by lowest max utilization across windows
  return available.reduce((best, current) => {
    const bestMax = maxUtilization(best)
    const currentMax = maxUtilization(current)
    return currentMax < bestMax ? current : best
  })
}

function maxUtilization(quota: QuotaInfo): number {
  if (quota.windows.length === 0) return 0
  return Math.max(...quota.windows.map((w) => w.utilization))
}
