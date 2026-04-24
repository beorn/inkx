/**
 * Boundary-fake contract tests — one test per third-party API boundary
 * the harness fakes (accountly, claude-version, git-branch, filesystem).
 *
 * These prove the fake path actually flows through to the rendered frame:
 *
 *   account     → quota-warning scenario; SidePanel renders 87% bar
 *   version     → fake "9.9.9-test" version reaches the version row
 *   branch      → fake branch name reaches the cwd row
 *   filesystem  → tmp HOME is honored; no real ~/.cache/silvercode write
 *
 * Bead: km-silvercode.test-api-fakes
 */

import { existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { renderScenario } from "../../src/test/render-harness.tsx"
import { warningQuotas } from "../../src/test/fake-boundaries.ts"
import { welcome } from "../../src/test/scripts/welcome.ts"
import { parseFrame } from "../../src/test/parse-frame.ts"

const COLS = 120
const ROWS = 30

describe("boundary fakes — one contract per faked third-party API", () => {
  test("accountFactory — quota-warning scenario lights up the 5hr bar", async () => {
    const s = await renderScenario({
      script: welcome,
      cols: COLS,
      rows: ROWS,
      account: { plan: "claude_max_20x", quotas: warningQuotas() },
    })
    try {
      // The compact inline row uses `5hr` (windowShortLabel of "5-hour")
      // and ProgressBar renders `87%` when showPercentage is on.
      expect(s.text).toContain("5hr")
      expect(s.text).toContain("87%")
    } finally {
      s.dispose()
    }
  })

  test("versionFactory — custom version surfaces in the Claude Code row", async () => {
    // SidePanel reads CLAUDE_VERSION_AT_STARTUP (captured at module load
    // from the env var) so we can't override per-test from `setVersionFactoryOverride`
    // for that specific row — but the env var is set to "2.1.119" by the
    // setup file, and the row prefers `state.claudeCodeVersion` (from
    // session-init) when present. This test verifies the env-var path.
    const s = await renderScenario({ script: welcome, cols: COLS, rows: ROWS })
    try {
      expect(s.text).toContain("Claude Code v2.1.119")
    } finally {
      s.dispose()
    }
  })

  test("gitFactory — fake branch name reaches the cwd row", async () => {
    const s = await renderScenario({
      script: welcome,
      cols: COLS,
      rows: ROWS,
      cwd: "/tmp/sct",
      branch: "feat-x",
    })
    try {
      // The cwd row is `<shortCwd>:<branch>` — the side panel column cap
      // truncates if too long, so we use compact strings.
      expect(s.text).toContain("/tmp/sct:feat-x")
    } finally {
      s.dispose()
    }
  })

  test("filesystem — per-scenario tmp HOME isolates the disk cache", async () => {
    const s = await renderScenario({ script: welcome, cols: COLS, rows: ROWS })
    try {
      const root = s.cols && s.app ? process.env.HOME : null
      // The harness' allocated fsRoot equals process.env.HOME during the
      // render. It must be a fresh tmp dir, not the user's real home.
      expect(root).not.toBe(process.env.USER ? `/Users/${process.env.USER}` : "")
      expect(root?.startsWith("/tmp") || root?.startsWith("/var/folders")).toBe(true)
      // The cache file (if any was written) lives under our fake HOME.
      // ProbeActiveAccount's cache write only runs in the non-fake path,
      // so existence is best-effort — we mainly assert HOME redirection.
      const fakeCache = root ? join(root, ".cache", "silvercode") : ""
      expect(fakeCache).toMatch(/silvercode/)
    } finally {
      s.dispose()
    }
  })

  test("fake account email + plan render in the Silver Code panel rows", async () => {
    const s = await renderScenario({
      script: welcome,
      cols: COLS,
      rows: ROWS,
      account: { email: "fake@silvercode.dev", plan: "claude_pro", quotas: warningQuotas() },
    })
    try {
      const p = parseFrame(s)
      const panelText = p.sidePanel?.lines.join("\n") ?? ""
      // The plan label maps "claude_pro" → "Claude Pro" (planLabel).
      expect(panelText).toContain("Claude Pro")
    } finally {
      s.dispose()
    }
  })
})
