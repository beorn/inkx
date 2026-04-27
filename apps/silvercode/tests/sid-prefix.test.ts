import { describe, test, expect } from "vitest"
import { prefixSid, parseSid, bareSid } from "../src/sid-prefix.ts"

describe("prefixSid", () => {
  test("applies <agent>:<sid> when no prefix present", () => {
    expect(prefixSid("codex", "abc123")).toBe("codex:abc123")
    expect(prefixSid("claude-code", "abc-def")).toBe("claude-code:abc-def")
  })

  test("idempotent — already-prefixed ids pass through unchanged", () => {
    expect(prefixSid("codex", "codex:abc123")).toBe("codex:abc123")
    expect(prefixSid("claude-code", "claude-code:xyz")).toBe("claude-code:xyz")
  })

  test("does NOT recognize a different agent prefix as same agent", () => {
    // codex-prefixed sid passed in with claude-code agent gets re-prefixed.
    // Caller's responsibility is to already know the correct agent.
    expect(prefixSid("claude-code", "codex:abc")).toBe("claude-code:codex:abc")
  })

  test("empty bare sid returns empty", () => {
    expect(prefixSid("codex", "")).toBe("")
  })
})

describe("parseSid", () => {
  test("extracts agent + bare sid for canonical input", () => {
    expect(parseSid("codex:abc123")).toEqual({ agent: "codex", bareSid: "abc123" })
    expect(parseSid("claude-code:uuid-here")).toEqual({ agent: "claude-code", bareSid: "uuid-here" })
    expect(parseSid("github-copilot-cli:xyz")).toEqual({ agent: "github-copilot-cli", bareSid: "xyz" })
  })

  test("returns null agent + verbatim bare sid for inputs without prefix", () => {
    expect(parseSid("abc123")).toEqual({ agent: null, bareSid: "abc123" })
  })

  test("treats colon-containing sids that don't match agent-id shape as bare", () => {
    // Hypothetical bare sid that itself contains a colon — must not be
    // misread as a prefix.
    expect(parseSid("ABC:DEF")).toEqual({ agent: null, bareSid: "ABC:DEF" })
    expect(parseSid("123:xyz")).toEqual({ agent: null, bareSid: "123:xyz" })
    // Trailing colon, no body — not a valid prefix.
    expect(parseSid("codex:")).toEqual({ agent: "codex", bareSid: "" })
  })

  test("preserves multiple colons in the bare sid (only the first splits)", () => {
    expect(parseSid("codex:a:b:c")).toEqual({ agent: "codex", bareSid: "a:b:c" })
  })
})

describe("bareSid (convenience)", () => {
  test("strips prefix when present", () => {
    expect(bareSid("codex:abc")).toBe("abc")
    expect(bareSid("claude-code:xyz")).toBe("xyz")
  })

  test("returns input unchanged when no recognizable prefix", () => {
    expect(bareSid("just-a-uuid")).toBe("just-a-uuid")
    expect(bareSid("ABC:DEF")).toBe("ABC:DEF")
  })
})

describe("round-trip", () => {
  test("prefix → parse extracts the same agent + bare sid", () => {
    const cases: { agent: string; sid: string }[] = [
      { agent: "codex", sid: "abc123" },
      { agent: "claude-code", sid: "uuid-1234-5678" },
      { agent: "gemini", sid: "g_session_42" },
      { agent: "github-copilot-cli", sid: "ghc.opaque" },
      { agent: "claude-code-spawn", sid: "abc" },
      { agent: "claude-code-sdk", sid: "xyz" },
      { agent: "codex-spawn", sid: "stream-1714" },
    ]
    for (const { agent, sid } of cases) {
      const prefixed = prefixSid(agent, sid)
      const parsed = parseSid(prefixed)
      expect(parsed).toEqual({ agent, bareSid: sid })
    }
  })
})
