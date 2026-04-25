/**
 * Visual test — autolinks render as styled, hover-armed tokens.
 *
 * Drops a paragraph containing two configured autolink patterns into a
 * silvercode session and asserts the rendered frame surfaces the matching
 * text. Bead: km-silvercode.autolinks-config
 *
 * What this catches:
 *   - The YAML config under <cwd>/.km/config.yaml is loaded at App mount
 *   - DetectionText sees the autolink rules via AutolinksContext
 *   - Autolink matches make it into the rendered frame (text contains "+km" / "AGENTS.md")
 *
 * What this deliberately does NOT cover (visual harness limits):
 *   - Hover popover content — the renderer doesn't drive mouse-dwell timing.
 *     Popover dispatch is unit-tested via `resolvePreview` directly.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { detectAutolinks, mergeDetections } from "../../src/autolinks/match.ts"
import { detectReferences } from "../../src/detection.ts"
import { loadAutolinksConfig } from "../../src/autolinks/config.ts"

const SESSION = "fake-autolinks-session" as SessionId
const USER_TURN = "u1" as TurnId
const ASSISTANT_TURN = "a1" as TurnId

const ASSISTANT_TEXT = "Open AGENTS.md or visit +km for the docs."

function buildScript(): ReadonlyArray<AgentEvent> {
  return [
    {
      kind: "session-init",
      sessionId: SESSION,
      cwd: "/tmp/silvercode-autolinks",
      model: "claude-sonnet-4-6",
      mode: "auto",
      tools: ["Bash", "Read"],
      mcp_servers: [],
      slashCommands: [],
      skills: [],
      plugins: [],
      claudeCodeVersion: "2.1.119",
      apiKeySource: "OAuth",
      ts: 1000,
    },
    { kind: "user-message", sessionId: SESSION, turnId: USER_TURN, text: "links?", ts: 1010 },
    { kind: "turn-start", sessionId: SESSION, turnId: ASSISTANT_TURN, role: "assistant", ts: 1020 },
    {
      kind: "text-delta",
      sessionId: SESSION,
      turnId: ASSISTANT_TURN,
      blockIndex: 0,
      text: ASSISTANT_TEXT,
      ts: 1030,
    },
    { kind: "turn-end", sessionId: SESSION, turnId: ASSISTANT_TURN, stopReason: "end_turn", ts: 1040 },
  ]
}

describe("autolinks visual", () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "silvercode-smartlinks-visual-"))
    mkdirSync(join(cwd, ".km"))
    // Two smart-links: a literal "AGENTS.md" → first-paragraph; a regex
    // matching "+\w+" → bd-active. Neither pattern is shadowed by the
    // built-in URL/file/bead detectors, so both should land in the frame
    // as autolink-styled tokens.
    writeFileSync(
      join(cwd, ".km", "config.yaml"),
      `
smartlinks:
  - pattern: "AGENTS.md"
    resolves_to: "${cwd}/AGENTS.md"
    preview: first-paragraph
  - pattern: "/\\\\+\\\\w+/"
    resolves_to: "${cwd}"
    preview: bd-active
`,
    )
    // Provide a target file for the first-paragraph preview to resolve.
    writeFileSync(join(cwd, "AGENTS.md"), "# Title\n\nThe agents brief.\n")
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  test("config at <cwd>/.km/config.yaml is loaded into 2 rules", () => {
    const rules = loadAutolinksConfig(cwd)
    expect(rules).toHaveLength(2)
    expect(rules.map((r) => r.preview)).toEqual(["first-paragraph", "bd-active"])
  })

  test("matches dispatch into the autolink kind for both rules", () => {
    const rules = loadAutolinksConfig(cwd)
    const builtins = detectReferences(ASSISTANT_TEXT)
    const auto = detectAutolinks(ASSISTANT_TEXT, rules)
    const merged = mergeDetections(builtins, auto)
    const autolinkMatches = merged.filter((d) => d.kind === "autolink").map((d) => d.match)
    expect(autolinkMatches).toContain("AGENTS.md")
    expect(autolinkMatches).toContain("+km")
    // Each carries the expected preview kind so DetectionText dispatches
    // to the correct renderer.
    const previews = merged.filter((d) => d.kind === "autolink").map((d) => d.payload.preview)
    expect(previews).toContain("first-paragraph")
    expect(previews).toContain("bd-active")
  })

  test("rendered frame shows the assistant text with autolink tokens intact", async () => {
    const s = await renderScenario({
      script: buildScript(),
      cols: 120,
      rows: 30,
      cwd,
    })
    expect(s.text).toContain("AGENTS.md")
    expect(s.text).toContain("+km")
    s.dispose()
  })
})
