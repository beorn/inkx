import { describe, test, expect, vi } from "vitest"
import { createGoogleProvider } from "../../src/providers/google.ts"

/** Cast a vitest mock to satisfy the typeof fetch constraint */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asFetch = (mock: any): typeof fetch => mock

describe("google provider", () => {
  const provider = createGoogleProvider()

  test("checkQuota returns available for valid key", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(vi.fn().mockResolvedValue({ ok: true, status: 200 }))

    try {
      const result = await provider.checkQuota({ apiKey: "AIza-test" })
      expect(result.available).toBe(true)
      expect(result.provider).toBe("google")
      expect(result.windows).toHaveLength(0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota includes Google Cloud Service Usage quota limits when project and token are configured", async () => {
    const originalFetch = globalThis.fetch
    const originalProject = process.env.GOOGLE_CLOUD_PROJECT
    const originalToken = process.env.GOOGLE_CLOUD_ACCESS_TOKEN
    process.env.GOOGLE_CLOUD_PROJECT = "gemini-project"
    process.env.GOOGLE_CLOUD_ACCESS_TOKEN = "ya29.test"
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          metrics: [
            {
              metric: "generativelanguage.googleapis.com/generate_content_requests",
              displayName: "Generate Content API requests",
              consumerQuotaLimits: [
                {
                  unit: "1/min/{project}/{region}",
                  effectiveLimit: "60",
                },
                {
                  unit: "1/d/{project}",
                  effectiveLimit: "1500",
                },
              ],
            },
            {
              metric: "generativelanguage.googleapis.com/generate_content_input_token_count",
              displayName: "Generate Content input tokens",
              consumerQuotaLimits: [
                {
                  unit: "1/min/{project}/{region}",
                  effectiveLimit: "1000000",
                },
              ],
            },
          ],
        }),
      })
    globalThis.fetch = asFetch(fetchMock)

    try {
      const result = await provider.checkQuota({ apiKey: "AIza-test" })
      expect(result.available).toBe(true)
      expect(result.metadata?.googleCloudProject).toBe("gemini-project")
      expect(result.windows).toEqual([
        { name: "RPM", utilization: 0, limit: 60 },
        { name: "TPM", utilization: 0, limit: 1000000 },
        { name: "RPD", utilization: 0, limit: 1500 },
      ])
      expect(fetchMock).toHaveBeenLastCalledWith(
        "https://serviceusage.googleapis.com/v1beta1/projects/gemini-project/services/generativelanguage.googleapis.com/consumerQuotaMetrics?view=FULL",
        { headers: { Authorization: "Bearer ya29.test" } },
      )
    } finally {
      globalThis.fetch = originalFetch
      if (originalProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT
      else process.env.GOOGLE_CLOUD_PROJECT = originalProject
      if (originalToken === undefined) delete process.env.GOOGLE_CLOUD_ACCESS_TOKEN
      else process.env.GOOGLE_CLOUD_ACCESS_TOKEN = originalToken
    }
  })

  test("checkQuota returns error for invalid key (403)", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(vi.fn().mockResolvedValue({ ok: false, status: 403 }))

    try {
      const result = await provider.checkQuota({ apiKey: "invalid" })
      expect(result.available).toBe(false)
      expect(result.error).toBe("Invalid API key")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota returns error for invalid key (400)", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(vi.fn().mockResolvedValue({ ok: false, status: 400 }))

    try {
      const result = await provider.checkQuota({ apiKey: "invalid" })
      expect(result.available).toBe(false)
      expect(result.error).toBe("Invalid API key")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota handles network error", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = asFetch(vi.fn().mockRejectedValue(new Error("DNS resolution failed")))

    try {
      const result = await provider.checkQuota({ apiKey: "AIza-test" })
      expect(result.available).toBe(false)
      expect(result.error).toBe("DNS resolution failed")
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test("checkQuota returns error for missing key", async () => {
    const result = await provider.checkQuota({})
    expect(result.available).toBe(false)
    expect(result.error).toBe("No API key found")
  })
})
