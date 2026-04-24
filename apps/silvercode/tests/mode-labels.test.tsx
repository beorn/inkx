/**
 * Mode-label contract tests.
 *
 * The permission-mode UI in silvercode has a five-mode cycle:
 *   ask → plan → accept-edits → auto → bypass → back to ask
 *
 * `ask` is first in the cycle (matching Claude Code's "always ask"
 * default behavior), but `auto` remains the startup default since
 * silvercode is meant for unattended runs. The `ask` label renders
 * as grey ($muted) "always ask" with a `?` icon.
 *
 * Plan mode uses `⏸` (pause glyph) to match Claude Code's iconography.
 * Bypass mode label is "dangerously bypass on" — the stronger wording
 * reflects that bypass skips ALL approvals including destructive ops.
 */
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { readFileSync } from "node:fs"
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { MODE_COLORS, MODE_ICONS, MODE_LABELS, SidePanel } from "../src/components/SidePanel.tsx"
import type { Controller, SessionHandle } from "../src/controller.ts"
import { createSessionStore } from "@km/agent-harness"

const TOTAL_COLS = 120
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

function makeStubSession(id = "fake"): SessionHandle {
  // Minimal SessionHandle: just enough state for SidePanel to render
  // without blowing up. Store is a real store so useStoreSignal works.
  const store = createSessionStore()
  return {
    id,
    name: "fake",
    session: { sessionId: id } as any,
    store,
    unsubscribe: () => {},
  } as unknown as SessionHandle
}

function makeStubController(): Controller {
  return {
    snapshot: () => [],
    subscribe: () => () => {},
    onFocusChange: () => () => {},
    focusedId: () => "fake",
    focus: () => {},
    send: () => {},
    closeAll: () => {},
    respondPermission: () => {},
    holdQueue: () => {},
    setQueuedText: () => {},
    clearQueue: () => {},
    queuedText: () => "",
    onQueueChange: () => () => {},
    handoff: () => {},
    fork: async () => ({}) as any,
    spawnSession: async () => ({}) as any,
    runSlashCommand: () => {},
  } as unknown as Controller
}

describe("MODE_LABELS / MODE_ICONS / MODE_COLORS", () => {
  test("`ask` mode renders as grey `?` + `always ask` label", () => {
    expect(MODE_ICONS["ask"]).toBe("?")
    expect(MODE_LABELS["ask"]).toBe("always ask")
    expect(MODE_COLORS["ask"]).toBe("$muted")
  })

  test("`plan` mode icon is ‖ (text-rendered double bar, not emoji-styled ⏸)", () => {
    expect(MODE_ICONS["plan"]).toBe("‖")
    expect(MODE_LABELS["plan"]).toBe("plan mode on")
  })

  test("`bypass` label is `dangerously bypass on`", () => {
    expect(MODE_LABELS["bypass"]).toBe("dangerously bypass on")
    expect(MODE_ICONS["bypass"]).toBe("!")
  })

  test("all five permission modes are defined", () => {
    const modes = ["ask", "plan", "accept-edits", "auto", "bypass"]
    for (const m of modes) {
      expect(MODE_LABELS).toHaveProperty(m)
      expect(MODE_ICONS).toHaveProperty(m)
      expect(MODE_COLORS).toHaveProperty(m)
    }
  })
})

describe("SidePanel mode row in `ask` mode", () => {
  test("renders `? always ask` for mode=ask", () => {
    const render = createRenderer({ cols: TOTAL_COLS, rows: 40 })
    const focused = makeStubSession()
    const controller = makeStubController()
    const app = render(
      <SidePanel
        focused={focused}
        sessions={[focused]}
        focusedSessionId={focused.id}
        onFocusSession={() => {}}
        mode="ask"
        onCycleMode={() => {}}
        cwd="/tmp/fake"
        controller={controller}
      />,
    )
    expect(app.text).toContain("always ask")
    expect(app.text).toContain("?")
  })
})

describe("App default mode + cycleMode order", () => {
  test("default mode is `auto` and cycle starts with `ask`", () => {
    // Lightweight contract check via source inspection — avoids spinning
    // up the full App render tree (would need mocking controller + claude
    // subprocess).
    const appSrc = readFileSync(join(REPO_ROOT, "src/App.tsx"), "utf8")
    // Startup default stays as `auto` — silvercode is unattended by default.
    expect(appSrc).toMatch(/useState<string>\("auto"\)/)
    // The cycle array must list all five modes in order, with `ask` first.
    const cycleMatches = appSrc.match(
      /\["ask",\s*"plan",\s*"accept-edits",\s*"auto",\s*"bypass"\]/g,
    )
    // Should appear in BOTH cycleMode (the fn) AND the /mode slash command.
    expect(cycleMatches?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  test("module-level MODE_COLOR in App includes `ask`", () => {
    const appSrc = readFileSync(join(REPO_ROOT, "src/App.tsx"), "utf8")
    // Find the MODE_COLOR declaration and check `ask` appears as a key.
    expect(appSrc).toMatch(/MODE_COLOR:\s*Record<string,\s*string>\s*=\s*\{[\s\S]*?ask:\s*"\$muted"/)
  })
})
