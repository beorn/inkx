/**
 * Regression test for the d17afaa82 blank-screen bug.
 *
 * Symptom (pre-d17afaa82): launching `silvercode` (no flags) routed through
 * `connectAcpRegistry("claude-code", ...)` whose registry entry was
 * `bun x @km/claude-acp`. That command 404'd on npm because @km/claude-acp
 * is private (workspace-only). The spawn failed silently inside the
 * `void spawnSession().catch(...)` swallow in the controller — no session
 * was ever created, the App's session list stayed empty, and the welcome
 * card painted onto a blank screen because there was no session to wrap.
 *
 * Layer 1 (registry-adapters.test.ts → "ACP_REGISTRY bin reachability")
 * catches this at the spawn-target level — every registry id must point at
 * something that exists. THIS test catches it at the symptom level: render
 * the App with a known-good spawn factory and assert the welcome card
 * actually paints.
 *
 * Why Path B (direct render with stubbed factory) over Path A (termless
 * spawn of bootstrap.ts): Path B reuses `renderScenario`, which is the
 * canonical harness silvercode uses for visual tests (welcome-card-hidden,
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

test("App paints the welcome card when a session can spawn (regression: d17afaa82)", async () => {
  // The welcome script has zero events — the app spawns a session, the fake
  // factory hands over a ScriptedFakeSession, and the App stays in the
  // "no messages yet" state where the welcome card is the focused pane.
  const s = await renderScenario({ script: welcome, cols: 120, rows: 40 })

  // Three load-bearing checks cover the regions that must paint:
  // - figlet banner (multi-line ASCII art) → Welcome brand mark
  // - "COMMANDS"                            → Welcome section header
  // - "auto mode on"                        → SidePanel mode label
  //
  // The brand banner is now figlet ASCII art (no literal "SILVER" / "CODE"
  // glyphs in the rendered text), so assert structurally: the figlet
  // "Standard" SILVER block contains the row "____ ___ _ __" — a unique
  // glyph signature that only appears inside the brand banner. If the App
  // was empty (the d17afaa82 failure mode), all three would be missing and
  // the assertion would fail loudly with the actual rendered text in diff.
  // Bead: km-cr94.
  expect(s.text).toContain("____ ___ _ __")
  expect(s.text).toContain("COMMANDS")
  expect(s.text).toContain("auto mode on")

  // Belt-and-suspenders: the rendered text must have substantial content.
  // The original bug rendered ONLY a focus-bar column; trimmed text was
  // mostly whitespace. Any real welcome card pushes well past 100 chars.
  expect(s.text.replace(/\s+/g, "").length).toBeGreaterThan(100)

  s.dispose()
})
