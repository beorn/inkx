import { describe, test, expect } from "vitest"
import { findBestAccount } from "../src/quota.ts"
import type { QuotaInfo } from "../src/types.ts"

describe("findBestAccount", () => {
  test("returns account with lowest max utilization", () => {
    const quotas: QuotaInfo[] = [
      {
        accountName: "personal",
        provider: "claude-oauth",
        available: true,
        windows: [
          { name: "5-hour", utilization: 60 },
          { name: "7-day", utilization: 35 },
        ],
        checkedAt: Date.now(),
      },
      {
        accountName: "work",
        provider: "claude-oauth",
        available: true,
        windows: [
          { name: "5-hour", utilization: 15 },
          { name: "7-day", utilization: 12 },
        ],
        checkedAt: Date.now(),
      },
      {
        accountName: "org",
        provider: "claude-oauth",
        available: true,
        windows: [
          { name: "5-hour", utilization: 80 },
          { name: "7-day", utilization: 50 },
        ],
        checkedAt: Date.now(),
      },
    ]

    const best = findBestAccount(quotas)
    expect(best?.accountName).toBe("work")
  })

  test("returns undefined when no accounts available", () => {
    const quotas: QuotaInfo[] = [
      {
        accountName: "personal",
        provider: "claude-oauth",
        available: false,
        windows: [{ name: "5-hour", utilization: 100 }],
        checkedAt: Date.now(),
      },
    ]

    expect(findBestAccount(quotas)).toBeUndefined()
  })

  test("excludes accounts with errors", () => {
    const quotas: QuotaInfo[] = [
      {
        accountName: "errored",
        provider: "claude-oauth",
        available: true,
        windows: [{ name: "5-hour", utilization: 0 }],
        error: "Network timeout",
        checkedAt: Date.now(),
      },
      {
        accountName: "ok",
        provider: "claude-oauth",
        available: true,
        windows: [{ name: "5-hour", utilization: 50 }],
        checkedAt: Date.now(),
      },
    ]

    const best = findBestAccount(quotas)
    expect(best?.accountName).toBe("ok")
  })

  test("handles accounts with no windows", () => {
    const quotas: QuotaInfo[] = [
      {
        accountName: "no-windows",
        provider: "claude-oauth",
        available: true,
        windows: [],
        checkedAt: Date.now(),
      },
      {
        accountName: "has-windows",
        provider: "claude-oauth",
        available: true,
        windows: [{ name: "5-hour", utilization: 30 }],
        checkedAt: Date.now(),
      },
    ]

    const best = findBestAccount(quotas)
    // no-windows has maxUtilization=0 which is lowest
    expect(best?.accountName).toBe("no-windows")
  })

  test("returns undefined for empty array", () => {
    expect(findBestAccount([])).toBeUndefined()
  })
})
