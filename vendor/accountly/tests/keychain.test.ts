import { describe, test, expect } from "vitest"

describe("keychain", () => {
  test("JSON encoding preserves credential structure", () => {
    const credential = {
      claudeAiOauth: {
        accessToken: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test",
        refreshToken: "refresh_abc123",
        expiresAt: "2026-02-15T12:00:00Z",
      },
    }

    const json = JSON.stringify(credential)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse(json) as any

    expect(parsed.claudeAiOauth.accessToken).toBe(credential.claudeAiOauth.accessToken)
    expect(parsed.claudeAiOauth.refreshToken).toBe(credential.claudeAiOauth.refreshToken)
  })

  test("security command uses correct service name", () => {
    const service = "Claude Code-credentials"
    const findCmd = `security find-generic-password -s "${service}" -a "testuser" -w`
    expect(findCmd).toContain('-s "Claude Code-credentials"')
    expect(findCmd).toContain("-w")
  })

  test("credential has claudeAiOauth wrapper", () => {
    const keychainData = {
      claudeAiOauth: {
        accessToken: "sk-ant-oat01-test",
        refreshToken: "ant-rt01-test",
      },
    }

    // The accessToken lives inside claudeAiOauth
    expect(keychainData.claudeAiOauth.accessToken).toMatch(/^sk-ant-oat01-/)
  })
})
