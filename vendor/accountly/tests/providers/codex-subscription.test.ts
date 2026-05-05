import { describe, expect, test } from "vitest"
import { parseCodexQuotaJsonl } from "../../src/providers/codex-subscription.ts"

describe("codex subscription quota provider", () => {
  test("reads /status rate limits from token_count rollout events", () => {
    const jsonl = [
      JSON.stringify({
        timestamp: "2026-05-05T05:15:08.367Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          rate_limits: {
            limit_id: "codex",
            limit_name: null,
            primary: { used_percent: 5, window_minutes: 300, resets_at: 1777971606 },
            secondary: { used_percent: 2, window_minutes: 10080, resets_at: 1778538928 },
            plan_type: "pro",
          },
        },
      }),
    ].join("\n")

    const parsed = parseCodexQuotaJsonl(jsonl, "/tmp/rollout.jsonl")

    expect(parsed?.limits).toHaveLength(1)
    expect(parsed?.limits[0]).toMatchObject({
      id: "codex",
      label: "Codex",
      planType: "pro",
      primary: { usedPercent: 5, windowMinutes: 300, resetsAt: "2026-05-05T09:00:06.000Z" },
      secondary: { usedPercent: 2, windowMinutes: 10080, resetsAt: "2026-05-11T22:35:28.000Z" },
    })
  })

  test("keeps the latest limit per limit id", () => {
    const row = (used: number) =>
      JSON.stringify({
        timestamp: `2026-05-05T05:15:${String(used).padStart(2, "0")}.000Z`,
        type: "event_msg",
        payload: {
          type: "token_count",
          rate_limits: {
            limit_id: "codex",
            primary: { used_percent: used, window_minutes: 300, resets_at: 1777971606 },
          },
        },
      })

    const parsed = parseCodexQuotaJsonl([row(4), row(5)].join("\n"))

    expect(parsed?.limits[0]?.primary?.usedPercent).toBe(5)
    expect(parsed?.updatedAt).toBe("2026-05-05T05:15:05.000Z")
  })
})
