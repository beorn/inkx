import { describe, test, expect, vi } from "vitest"
import { createClaudeOAuthProvider, refreshOAuthToken, ensureFreshOAuth } from "../../src/providers/claude-oauth.ts"

/** Cast a vitest mock to satisfy the typeof fetch constraint */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asFetch = (mock: any): typeof fetch => mock

describe("claude-oauth provider", () => {
  const provider = createClaudeOAuthProvider()

  test("validates credential with direct accessToken", () => {
    expect(provider.validateCredential({ accessToken: "test-token" })).toBe(true)
  })

  test("validates credential with claudeAiOauth wrapper", () => {
    expect(
      provider.validateCredential({
        claudeAiOauth: { accessToken: "sk-ant-oat01-test" },
      }),
    ).toBe(true)
  })

  test("rejects credential without accessToken", () => {
    expect(provider.validateCredential({})).toBe(false)
    expect(provider.validateCredential({ accessToken: "" })).toBe(false)
    expect(provider.validateCredential({ apiKey: "sk-test" })).toBe(false)
    expect(provider.validateCredential({ claudeAiOauth: {} })).toBe(false)
    expect(provider.validateCredential({ claudeAiOauth: { accessToken: "" } })).toBe(false)
  })

  test("checkQuota returns error for invalid credential", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      }),
    )

    try {
      const result = await provider.checkQuota({
        accessToken: "invalid-token",
      })
      expect(result.available).toBe(false)
      expect(result.error).toContain("401")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota parses flat usage response", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            five_hour: {
              utilization: 60.0,
              resets_at: "2026-02-15T14:00:00Z",
            },
            seven_day: {
              utilization: 35.0,
              resets_at: "2026-02-20T00:00:00Z",
            },
            seven_day_opus: null,
            seven_day_sonnet: {
              utilization: 10.0,
              resets_at: "2026-02-19T00:00:00Z",
            },
            extra_usage: {
              is_enabled: true,
              monthly_limit: 20000,
              used_credits: 10000,
              utilization: 50.0,
            },
          }),
      }),
    )

    try {
      const result = await provider.checkQuota({
        accessToken: "valid-token",
      })

      expect(result.available).toBe(true)
      expect(result.windows.length).toBeGreaterThanOrEqual(3)

      const fiveHour = result.windows.find((w) => w.name === "5-hour")
      expect(fiveHour).toBeDefined()
      expect(fiveHour!.utilization).toBe(60)

      const sevenDay = result.windows.find((w) => w.name === "7-day")
      expect(sevenDay).toBeDefined()
      expect(sevenDay!.utilization).toBe(35)

      const extra = result.windows.find((w) => w.name === "Extra usage")
      expect(extra).toBeDefined()
      expect(extra!.utilization).toBe(50)
      expect(extra!.remaining).toBe(10000)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota marks unavailable when 5-hour at 100%", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            five_hour: {
              utilization: 100.0,
              resets_at: "2026-02-15T14:00:00Z",
            },
            seven_day: {
              utilization: 50.0,
              resets_at: "2026-02-20T00:00:00Z",
            },
          }),
      }),
    )

    try {
      const result = await provider.checkQuota({
        accessToken: "valid-token",
      })
      expect(result.available).toBe(false)
      expect(result.windows[0]!.utilization).toBe(100)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota handles network error", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(vi.fn().mockRejectedValue(new Error("Network timeout")))

    try {
      const result = await provider.checkQuota({
        accessToken: "valid-token",
      })
      expect(result.available).toBe(false)
      expect(result.error).toBe("Network timeout")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota handles API error response", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            error: { message: "Rate limited" },
          }),
      }),
    )

    try {
      const result = await provider.checkQuota({
        accessToken: "valid-token",
      })
      expect(result.available).toBe(false)
      expect(result.error).toBe("Rate limited")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota skips null windows", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            five_hour: {
              utilization: 20.0,
              resets_at: "2026-02-15T14:00:00Z",
            },
            seven_day_opus: null,
            seven_day_cowork: null,
          }),
      }),
    )

    try {
      const result = await provider.checkQuota({
        accessToken: "valid-token",
      })
      expect(result.available).toBe(true)
      expect(result.windows).toHaveLength(1)
      expect(result.windows[0]!.name).toBe("5-hour")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota returns error for missing token", async () => {
    const result = await provider.checkQuota({})
    expect(result.available).toBe(false)
    expect(result.error).toBe("No access token found")
  })
})

describe("token refresh", () => {
  test("refreshOAuthToken returns undefined without refreshToken", async () => {
    const result = await refreshOAuthToken({ accessToken: "test" })
    expect(result).toBeUndefined()
  })

  test("refreshOAuthToken returns undefined for empty credential", async () => {
    const result = await refreshOAuthToken({})
    expect(result).toBeUndefined()
  })

  test("refreshOAuthToken updates direct format credential", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            token_type: "Bearer",
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 28800,
          }),
      }),
    )

    try {
      const result = await refreshOAuthToken({
        accessToken: "old-access",
        refreshToken: "old-refresh",
        expiresAt: Date.now() - 1000,
      })
      expect(result).toBeDefined()
      expect(result!.accessToken).toBe("new-access-token")
      expect(result!.refreshToken).toBe("new-refresh-token")
      expect(result!.expiresAt).toBeGreaterThan(Date.now())
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("refreshOAuthToken updates claudeAiOauth wrapper format", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            token_type: "Bearer",
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 28800,
          }),
      }),
    )

    try {
      const result = await refreshOAuthToken({
        claudeAiOauth: {
          accessToken: "old-access",
          refreshToken: "old-refresh",
          expiresAt: Date.now() - 1000,
          scopes: ["user:inference"],
        },
      })
      expect(result).toBeDefined()
      const oauth = result!.claudeAiOauth as Record<string, unknown>
      expect(oauth.accessToken).toBe("new-access-token")
      expect(oauth.refreshToken).toBe("new-refresh-token")
      expect(oauth.expiresAt).toBeGreaterThan(Date.now())
      expect(oauth.scopes).toEqual(["user:inference"]) // preserved
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("refreshOAuthToken returns undefined on HTTP error", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      }),
    )

    try {
      const result = await refreshOAuthToken({
        accessToken: "old",
        refreshToken: "invalid",
        expiresAt: Date.now() - 1000,
      })
      expect(result).toBeUndefined()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("ensureFreshOAuth skips refresh for non-expired token", async () => {
    const fetchSpy = vi.fn()
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(fetchSpy)

    try {
      const cred = {
        accessToken: "valid",
        refreshToken: "refresh",
        expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
      }
      const result = await ensureFreshOAuth(cred)
      expect(result).toBe(cred) // same object, no refresh
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("ensureFreshOAuth refreshes expired token and calls onRefresh", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            token_type: "Bearer",
            access_token: "fresh-token",
            refresh_token: "fresh-refresh",
            expires_in: 28800,
          }),
      }),
    )

    try {
      const onRefresh = vi.fn()
      const result = await ensureFreshOAuth(
        {
          accessToken: "stale",
          refreshToken: "old-refresh",
          expiresAt: Date.now() - 1000,
        },
        onRefresh,
      )
      expect(result).toBeDefined()
      expect(result!.accessToken).toBe("fresh-token")
      expect(onRefresh).toHaveBeenCalledOnce()
      expect(onRefresh.mock.calls[0]![0].accessToken).toBe("fresh-token")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
