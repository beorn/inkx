/**
 * Visual regression — plain URLs in messages flow through the autolinks
 * handler registry, NOT the legacy URL detection branch.
 *
 * Bead: km-silvercode.url-detection-via-handlers
 *
 * Before this migration: a `https://...` token in assistant text was matched
 * by `URL_RE` in `detection.ts`, became a `kind: "url"` detection, and
 * rendered through the legacy URL popover branch in `DetectionText`. The
 * autolinks handler registry was bypassed.
 *
 * After this migration: there is no `kind: "url"` detection. Plain URLs are
 * matched by `virtualUrlDetections` in `autolinks/match.ts`, become
 * `kind: "autolink"` with `payload.virtual === "1"`, and route through the
 * `https:` handler in the registry.
 *
 * What this test asserts (visual):
 *   1. The URL token shows up in the rendered frame.
 *   2. End-to-end pipeline (`detectReferences` + `detectAutolinks` +
 *      `mergeDetections`) produces exactly one detection at the URL span,
 *      and that detection is `kind: "autolink"` with `virtual === "1"`.
 *      This is the exact data `<DetectionText/>` consumes — proving the
 *      visual frame's URL token routes through the handler registry.
 *   3. The `payload.url` field used by the legacy URL popover renderer is
 *      NOT present (legacy used `payload.url`, registry uses `resolves_to`).
 */
import { describe, expect, test } from "vitest"
import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { detectReferences } from "../../src/detection.ts"
import { detectAutolinks, mergeDetections } from "../../src/autolinks/match.ts"

const SESSION = "fake-url-via-handlers" as SessionId
const USER_TURN = "u1" as TurnId
const ASSISTANT_TURN = "a1" as TurnId

const URL = "https://github.com/foo/bar"
const ASSISTANT_TEXT = `Open ${URL} for the docs.`

function buildScript(): ReadonlyArray<AgentEvent> {
  return [
    {
      kind: "session-init",
      sessionId: SESSION,
      cwd: "/tmp/silvercode-url-handlers",
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

describe("plain URL via handler registry — visual regression", () => {
  test("the URL token appears in the rendered assistant message", async () => {
    const s = await renderScenario({ script: buildScript(), cols: 120, rows: 30 })
    expect(s.text).toContain(URL)
    s.dispose()
  })

  test("DetectionText pipeline routes the URL through autolink, not the legacy `url` kind", () => {
    // This is the exact merge `<DetectionText/>` runs in its useMemo. We
    // check the detection list directly so the assertion is precise about
    // which renderer branch fires (autolink, NOT the dropped legacy url).
    const builtins = detectReferences(ASSISTANT_TEXT)
    const autolinks = detectAutolinks(ASSISTANT_TEXT, [])
    const merged = mergeDetections(builtins, autolinks)

    // The URL is the only detectable token in this message.
    expect(merged).toHaveLength(1)
    const d = merged[0]!

    // Crucial: kind is `autolink`, NOT `url`. Combined with `virtual === "1"`
    // this proves we're going through `virtualUrlDetections` + the handler
    // registry, not through the removed `kind: "url"` branch.
    expect(d.kind).toBe("autolink")
    expect(d.payload.virtual).toBe("1")
    expect(d.payload.resolves_to).toBe(URL)

    // Legacy URL detections used `payload.url`. The new path uses
    // `resolves_to`. If the legacy branch ever resurrects, this catches it.
    expect(d.payload.url).toBeUndefined()

    // The detection range covers the entire URL.
    const start = ASSISTANT_TEXT.indexOf(URL)
    expect(d.start).toBe(start)
    expect(d.end).toBe(start + URL.length)
  })
})
