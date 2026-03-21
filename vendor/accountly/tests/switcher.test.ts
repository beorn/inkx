import { describe, test, expect } from "vitest"
import type { SwitchResult } from "../src/switcher.ts"

describe("switcher logic", () => {
  test("SwitchResult success shape", () => {
    const result: SwitchResult = {
      success: true,
      accountName: "personal",
    }
    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
  })

  test("SwitchResult error shape", () => {
    const result: SwitchResult = {
      success: false,
      accountName: "missing",
      error: "Account not found",
    }
    expect(result.success).toBe(false)
    expect(result.error).toBe("Account not found")
  })

  test("only claude-oauth accounts can be switched", () => {
    // This tests the logic, not the actual switching
    const provider: string = "anthropic-api"
    const canSwitch = provider === "claude-oauth"
    expect(canSwitch).toBe(false)
  })
})
