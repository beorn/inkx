import { describe, expect, test, vi } from "vitest"
import { createCursorApiProvider } from "../../src/providers/cursor-api.ts"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asFetch = (mock: any): typeof fetch => mock

describe("cursor-api provider", () => {
  const provider = createCursorApiProvider()

  test("checkQuota fetches Cursor API key metadata from /v0/me", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          apiKeyName: "Personal SDK",
          createdAt: "2026-04-30T12:00:00Z",
          userEmail: "dev@example.com",
        }),
      }),
    )

    try {
      const result = await provider.checkQuota({ apiKey: "key_cursor_test" })
      expect(result.available).toBe(true)
      expect(result.provider).toBe("cursor-api")
      expect(result.windows).toEqual([])
      expect(result.metadata).toEqual({
        apiKeyName: "Personal SDK",
        createdAt: "2026-04-30T12:00:00Z",
        userEmail: "dev@example.com",
      })
      expect(globalThis.fetch).toHaveBeenCalledWith("https://api.cursor.com/v0/me", {
        headers: { Authorization: "Bearer key_cursor_test" },
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota returns invalid-key error for 401", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(vi.fn().mockResolvedValue({ ok: false, status: 401 }))

    try {
      const result = await provider.checkQuota({ apiKey: "bad" })
      expect(result.available).toBe(false)
      expect(result.error).toBe("Invalid API key")
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
