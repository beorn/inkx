import type { AccountConfig, QuotaInfo } from "./types.ts"
import { readCredential } from "./credentials.ts"
import { getProvider } from "./providers/index.ts"

/** Check quota for a single account */
export async function checkAccountQuota(account: AccountConfig): Promise<QuotaInfo> {
  const credential = readCredential(account.name)
  if (!credential) {
    return {
      accountName: account.name,
      provider: account.provider,
      available: false,
      windows: [],
      error: "No credentials found",
      checkedAt: Date.now(),
    }
  }

  const provider = getProvider(account.provider)
  const result = await provider.checkQuota(credential)
  result.accountName = account.name
  return result
}

/** Check quota for all accounts in parallel */
export async function checkAllQuotas(accounts: AccountConfig[]): Promise<QuotaInfo[]> {
  const enabled = accounts.filter((a) => !a.disabled)
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
