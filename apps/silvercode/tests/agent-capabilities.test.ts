import { describe, test, expect } from "vitest"
import {
  type AgentCapabilities,
  type CapabilityContext,
  type CapabilityOption,
  assertCapabilities,
  CLAUDE_CAPABILITIES,
} from "../src/agent-capabilities.ts"
import { BUILTIN_AGENTS } from "../src/config-schema.ts"

describe("assertCapabilities — structural invariants", () => {
  test("accepts well-formed capability arrays (no throw)", () => {
    expect(() =>
      assertCapabilities({
        foo: {
          capabilities: {
            thinking: [
              { id: "low", name: "low", icon: "○", description: "", default: true, activate: () => {} },
              { id: "high", name: "high", icon: "●", description: "", activate: () => {} },
            ],
          },
        },
      }),
    ).not.toThrow()
  })

  test("accepts agents without capabilities", () => {
    expect(() => assertCapabilities({ bare: {} })).not.toThrow()
    expect(() => assertCapabilities({ stub: { capabilities: {} } })).not.toThrow()
  })

  test("rejects duplicate ids within an array", () => {
    expect(() =>
      assertCapabilities({
        foo: {
          capabilities: {
            thinking: [
              { id: "low", name: "a", icon: "○", description: "", activate: () => {} },
              { id: "low", name: "b", icon: "●", description: "", activate: () => {} },
            ],
          },
        },
      }),
    ).toThrow(/duplicate option id "low"/)
  })

  test("rejects more than one default per array", () => {
    expect(() =>
      assertCapabilities({
        foo: {
          capabilities: {
            planning: [
              { id: "a", name: "a", icon: "?", description: "", default: true, activate: () => {} },
              { id: "b", name: "b", icon: "!", description: "", default: true, activate: () => {} },
            ],
          },
        },
      }),
    ).toThrow(/2 options marked default/)
  })

  test("rejects ids that don't match the canonical shape", () => {
    expect(() =>
      assertCapabilities({
        foo: {
          capabilities: {
            thinking: [{ id: "Invalid Spaces", name: "x", icon: "○", description: "", activate: () => {} }],
          },
        },
      }),
    ).toThrow(/must match/)
  })

  test("zero defaults is valid (UI shows nothing pre-selected)", () => {
    expect(() =>
      assertCapabilities({
        foo: {
          capabilities: {
            thinking: [
              { id: "a", name: "a", icon: "○", description: "", activate: () => {} },
              { id: "b", name: "b", icon: "●", description: "", activate: () => {} },
            ],
          },
        },
      }),
    ).not.toThrow()
  })
})

describe("CLAUDE_CAPABILITIES — Claude's reference descriptors", () => {
  test("thinking has 4 tiers with exactly one default", () => {
    expect(CLAUDE_CAPABILITIES.thinking).toBeDefined()
    const arr = CLAUDE_CAPABILITIES.thinking!
    expect(arr).toHaveLength(4)
    const defaults = arr.filter((o) => o.default === true)
    expect(defaults).toHaveLength(1)
    expect(defaults[0]!.id).toBe("normal")
  })

  test("thinking option ids match Claude Code's slash commands", () => {
    const ids = (CLAUDE_CAPABILITIES.thinking ?? []).map((o) => o.id)
    expect(ids).toEqual(["normal", "think", "think_hard", "ultrathink"])
  })

  test("planning has 5 modes with exactly one default", () => {
    expect(CLAUDE_CAPABILITIES.planning).toBeDefined()
    const arr = CLAUDE_CAPABILITIES.planning!
    expect(arr).toHaveLength(5)
    const defaults = arr.filter((o) => o.default === true)
    expect(defaults).toHaveLength(1)
    expect(defaults[0]!.id).toBe("auto")
  })

  test("planning modes use Claude Code's color conventions (not universal risk mapping)", () => {
    const byId = new Map((CLAUDE_CAPABILITIES.planning ?? []).map((o) => [o.id, o]))
    expect(byId.get("ask")?.color).toBe("$muted")
    expect(byId.get("plan")?.color).toBe("$info")
    expect(byId.get("accept-edits")?.color).toBe("$purple")
    expect(byId.get("auto")?.color).toBe("$warning")
    expect(byId.get("bypass")?.color).toBe("$error")
  })
})

describe("BUILTIN_AGENTS — Claude variants share CLAUDE_CAPABILITIES", () => {
  test("claude-code, claude-code-spawn, claude-code-sdk all reference the same capability arrays", () => {
    const a = BUILTIN_AGENTS["claude-code"]
    const b = BUILTIN_AGENTS["claude-code-spawn"]
    const c = BUILTIN_AGENTS["claude-code-sdk"]
    expect(a?.capabilities).toBe(CLAUDE_CAPABILITIES)
    expect(b?.capabilities).toBe(CLAUDE_CAPABILITIES)
    expect(c?.capabilities).toBe(CLAUDE_CAPABILITIES)
  })

  test("codex variants reference CODEX_CAPABILITIES; gemini + github-copilot-cli still undefined", () => {
    expect(BUILTIN_AGENTS["codex"]?.capabilities).toBeDefined()
    expect(BUILTIN_AGENTS["codex-spawn"]?.capabilities).toBe(BUILTIN_AGENTS["codex"]?.capabilities)
    expect(BUILTIN_AGENTS["gemini"]?.capabilities).toBeUndefined()
    // Note: BUILTIN_AGENTS uses the canonical registry id `github-copilot-cli`,
    // not the friendly alias `copilot` — the rename happened in the
    // track-removal commit so the agent id matches AcpRegistryId.
    expect(BUILTIN_AGENTS["github-copilot-cli"]?.capabilities).toBeUndefined()
    expect(BUILTIN_AGENTS["github-copilot-cli"]).toBeDefined()
    expect(BUILTIN_AGENTS["copilot"]).toBeUndefined()
  })

  test("codex thinking + planning shapes match the design", () => {
    const codex = BUILTIN_AGENTS["codex"]?.capabilities
    expect(codex?.thinking?.map((o) => o.id)).toEqual(["low", "medium", "high"])
    expect(codex?.planning?.map((o) => o.id)).toEqual(["normal", "plan"])
    expect(codex?.thinking?.find((o) => o.default === true)?.id).toBe("medium")
    expect(codex?.planning?.find((o) => o.default === true)?.id).toBe("normal")
  })

  test("module load already passed assertCapabilities (no throw at import time)", () => {
    // The assertion runs at config-schema.ts module load. If anything was
    // malformed in CLAUDE_CAPABILITIES, importing BUILTIN_AGENTS above
    // would have thrown. Re-run the validator here to catch regressions
    // when new agents add capabilities.
    expect(() => assertCapabilities(BUILTIN_AGENTS)).not.toThrow()
  })
})

describe("CapabilityOption — activate runs in the App's render context", () => {
  test("activate signature accepts CapabilityContext", () => {
    let activated = false
    const opt: CapabilityOption = {
      id: "test",
      name: "test",
      icon: "T",
      description: "",
      activate: (_ctx: CapabilityContext) => {
        activated = true
      },
    }
    // Compile-time check: the cast below should typecheck.
    const stubCtx = {
      controller: null as unknown as CapabilityContext["controller"],
      sessionId: "s1",
      setThinking: () => {},
      setMode: () => {},
    }
    opt.activate(stubCtx)
    expect(activated).toBe(true)
  })
})

describe("AgentCapabilities — type contract", () => {
  test("missing thinking + planning is valid", () => {
    const caps: AgentCapabilities = {}
    expect(caps.thinking).toBeUndefined()
    expect(caps.planning).toBeUndefined()
  })
})
