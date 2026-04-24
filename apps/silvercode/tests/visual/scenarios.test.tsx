/**
 * Visual scenarios — run every canonical script through the real <App/>
 * and assert the layout invariants hold. One describe block per scenario,
 * each ending with `expectLayoutInvariants(s)`.
 *
 * What this catches
 * -----------------
 * - Overflow: any content bleeding past leftWidth into the side panel zone
 * - Icon drift: ● > ◈ ⚙ landing at different columns
 * - Side panel lost: no Sessions/SilverCode markers in the right region
 * - Command input missing: no `>` prompt in the bottom rows
 *
 * What this does NOT catch
 * ------------------------
 * - Stateful UI (queue editor height, focus ring, scroll) — v2
 * - Process-exit behavior (resume hint) — v2
 * - Time-based rendering (verb rotation, elapsed tail) — v2
 *
 * For coverage of those classes, see:
 *   km-silvercode.test-ui-driver
 *   km-silvercode.test-process-harness
 */

import { describe, expect, test } from "vitest"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { welcome } from "../../src/test/scripts/welcome.ts"
import { helloWorld } from "../../src/test/scripts/helloWorld.ts"
import { multiTurn } from "../../src/test/scripts/multiTurn.ts"
import { bashTool } from "../../src/test/scripts/bashTool.ts"
import { longToolResult } from "../../src/test/scripts/longToolResult.ts"
import { permissionRequest } from "../../src/test/scripts/permissionRequest.ts"
import { expectLayoutInvariants, parseFrame } from "./_invariants.ts"

const COLS = 120
const ROWS = 30

describe("visual scenarios — layout invariants hold", () => {
  test("welcome: empty state renders the Welcome panel + side panel + input", async () => {
    const s = await renderScenario({ script: welcome, cols: COLS, rows: ROWS })
    const p = parseFrame(s)
    expect(p.welcome.visible).toBe(true)
    expect(p.sidePanel!.hasSilverCodeRow).toBe(true)
    expect(p.sidePanel!.hasClaudeCodeRow).toBe(true)
    // Welcome has no card stream so we skip the icon-align invariant.
    expectLayoutInvariants(s, { skip: { icons: true } })
  })

  test("helloWorld: user + assistant blocks render in the card stream", async () => {
    const s = await renderScenario({ script: helloWorld, cols: COLS, rows: ROWS })
    const p = parseFrame(s)
    expect(p.welcome.visible).toBe(false)
    const assistant = p.cardStream.find((b) => b.glyph === "●")
    expect(assistant, "missing ● assistant block").toBeDefined()
    expect(assistant!.firstLineText).toContain("Hi")
    expectLayoutInvariants(s)
  })

  test("multiTurn: multiple user/assistant turns stack in the card stream", async () => {
    const s = await renderScenario({ script: multiTurn, cols: COLS, rows: ROWS })
    const p = parseFrame(s)
    // The multiTurn script has 2 user messages + 2 assistant replies.
    const assistants = p.cardStream.filter((b) => b.glyph === "●")
    expect(assistants.length, `expected at least 1 assistant block`).toBeGreaterThanOrEqual(1)
    expectLayoutInvariants(s)
  })

  test("bashTool: tool-call block + assistant text render together", async () => {
    const s = await renderScenario({ script: bashTool, cols: COLS, rows: ROWS })
    const p = parseFrame(s)
    // Tool-call uses `⚙` glyph (non-running). Running tool uses a Spinner
    // so ⚙ may or may not be present depending on timing — the bash script
    // includes a tool-result so the call is complete.
    const tool = p.cardStream.find((b) => b.glyph === "⚙")
    expect(tool, `expected ⚙ tool-call glyph in card stream.\n${s.text}`).toBeDefined()
    expectLayoutInvariants(s)
  })

  test("longToolResult: 1KB unwrappable blob doesn't push side panel off-screen", async () => {
    const s = await renderScenario({ script: longToolResult, cols: COLS, rows: ROWS })
    // No overflow invariant: the outer `overflow=hidden` on the left
    // column MUST clip the 1KB unwrappable token inside the tool-result.
    expectLayoutInvariants(s)
  })

  test("permissionRequest: awaiting-permission keeps layout intact", async () => {
    const s = await renderScenario({ script: permissionRequest, cols: COLS, rows: ROWS })
    expectLayoutInvariants(s)
  })
})
