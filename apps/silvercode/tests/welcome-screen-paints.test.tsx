/**
 * Regression test for the d17afaa82 blank-screen bug.
 *
 * Symptom (pre-d17afaa82): launching `silvercode` (no flags) routed through
 * `connectAcpRegistry("claude-code", ...)` whose registry entry was
 * `bun x @km/claude-acp`. That command 404'd on npm because @km/claude-acp
 * is private (workspace-only). The spawn failed silently inside the
 * `void spawnSession().catch(...)` swallow in the controller — no session
 * was ever created, the App's session list stayed empty, and the welcome
 * welcome screen painted onto a blank screen because there was no session to wrap.
 *
 * Layer 1 (registry-adapters.test.ts → "ACP_REGISTRY bin reachability")
 * catches this at the spawn-target level — every registry id must point at
 * something that exists. THIS test catches it at the symptom level: render
 * the App with a known-good spawn factory and assert the welcome screen
 * actually paints.
 *
 * Why Path B (direct render with stubbed factory) over Path A (termless
 * spawn of bootstrap.ts): Path B reuses `renderScenario`, which is the
 * canonical harness silvercode uses for visual tests (welcome-pane-hidden,
 * pane-headers, etc.). It's deterministic, ~50ms, and exercises the exact
 * App.tsx code path a real user hits — minus the subprocess. The user's
 * actual failure mode (real spawn → no session → blank) is downstream of
 * "session-spawn-succeeds → app paints"; Layer 1 covers spawn reachability,
 * so Layer 2 only needs to verify the paint contract. Path A would re-test
 * what Layer 1 already covers, plus add subprocess flakiness.
 */

import { expect, test } from "vitest"
import { renderScenario } from "../src/test/render-harness.tsx"
import { welcome } from "../src/test/scripts/welcome.ts"

test("App paints the welcome screen when a session can spawn (regression: d17afaa82)", async () => {
  // The welcome script has zero events — the app spawns a session, the fake
  // factory hands over a ScriptedFakeSession, and the App stays in the
  // "no messages yet" state where the welcome screen is the focused pane.
  const s = await renderScenario({ script: welcome, cols: 120, rows: 50 })

  // Two load-bearing checks cover the regions that must paint:
  // - figlet banner (multi-line ASCII art) → Welcome brand mark
  // - "auto mode on"                        → SidePanel mode label
  //
  // The brand banner is figlet ASCII art (no literal "SILVER" / "CODE"
  // glyphs). At 120 cols the BIG tier renders, with unique top-row sig
  // "_____ _____ _ __" — only ever appears inside the brand banner.
  // Welcome is now banner-only chrome (no embedded command box); the
  // single command surface is the App-level SessionPromptComposer at
  // the bottom of the layout (covered by separate composer tests).
  // If the App was empty (the d17afaa82 failure mode), both would
  // be missing. Bead: km-cr94.
  expect(s.text).toMatch(/[ \u00a0]░░░░░░[ \u00a0]{2}░░░░/)
  expect(s.text).toContain("auto mode on")

  // Belt-and-suspenders: the rendered text must have substantial content.
  // The original bug rendered ONLY a focus-bar column; trimmed text was
  // mostly whitespace. Any real welcome screen pushes well past 100 chars.
  expect(s.text.replace(/\s+/g, "").length).toBeGreaterThan(100)

  s.dispose()
})
