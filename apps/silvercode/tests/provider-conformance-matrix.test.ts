import { describe, expect, test } from "vitest"
import { ACP_REGISTRY_IDS } from "@km/agent-harness"
import { BUILTIN_AGENTS } from "../src/config-schema.ts"
import {
  L5_PROVIDER_FEATURES,
  PROVIDER_CONFORMANCE_MATRIX,
  providerConformanceRow,
  renderProviderConformanceMarkdown,
} from "../src/provider-conformance.ts"

describe("provider conformance matrix", () => {
  test("has rows for every built-in, ACP registry id, fake provider, and planned opencode/Kilo provider", () => {
    const expected = new Set([...Object.keys(BUILTIN_AGENTS), ...ACP_REGISTRY_IDS, "fake-acp", "opencode-kilo"])

    expect(new Set(PROVIDER_CONFORMANCE_MATRIX.map((row) => row.providerId))).toEqual(expected)
  })

  test("covers every L5 feature with evidence or explicit fallback semantics", () => {
    for (const row of PROVIDER_CONFORMANCE_MATRIX) {
      expect(new Set(Object.keys(row.features))).toEqual(new Set(L5_PROVIDER_FEATURES))
      for (const feature of L5_PROVIDER_FEATURES) {
        const cell = row.features[feature]
        expect(cell, `${row.providerId}:${feature}`).toBeDefined()
        if (cell.status === "supported") {
          expect(cell.evidence.length, `${row.providerId}:${feature}`).toBeGreaterThan(0)
        } else {
          expect(cell.fallback?.length, `${row.providerId}:${feature}`).toBeGreaterThan(0)
        }
      }
    }
  })

  test("marks fake ACP as the executable baseline for provider contracts", () => {
    const fake = providerConformanceRow("fake-acp")

    for (const feature of [
      "runtime",
      "turns",
      "streamingBlocks",
      "permissions",
      "plans",
      "configOptions",
      "trafficReplay",
    ] as const) {
      expect(fake.features[feature]).toMatchObject({ status: "supported" })
      expect(fake.features[feature].evidence.some((item) => item.includes("test"))).toBe(true)
    }
  })

  test("renders a deterministic markdown table for docs and bead evidence", () => {
    const markdown = renderProviderConformanceMarkdown()

    expect(markdown).toContain("| Provider | Runtime | Turns | Streaming Blocks |")
    expect(markdown).toContain("| fake-acp | supported | supported | supported |")
    expect(markdown).toContain("| opencode-kilo | partial | partial | partial |")
  })
})
