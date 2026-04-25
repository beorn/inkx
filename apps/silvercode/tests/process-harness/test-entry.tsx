#!/usr/bin/env bun
/**
 * test-entry — subprocess entry point for the silvercode process harness.
 *
 * Boots `<App />` under a real silvery `run()` (so the process owns a real
 * TTY, alt-screen, hardware cursor) but injects a `spawnFactory` that returns
 * a ScriptedFakeSession instead of spawning real `claude --bare -p`. Lets the
 * harness drive the entire UI through PTY input + ANSI output without an API
 * key or claude binary on the box.
 *
 * Configuration is read from the environment to keep the spawn path simple:
 *
 *   SILVERCODE_TEST_BARE=1            # passes --bare semantics to App
 *   SILVERCODE_TEST_LAYOUT=single     # layout prop
 *   SILVERCODE_TEST_TRACK=claude      # track prop
 *   SILVERCODE_TEST_MODEL=...         # model prop
 *   SILVERCODE_TEST_CWD=/tmp/...      # cwd prop
 *   SILVERCODE_TEST_FAKE_ACCOUNT_JSON # JSON-encoded AccountScenario, optional
 *
 * The harness writes these before spawning. test-entry.tsx then runs the
 * exact same React tree silvercode runs in production, minus the subprocess.
 *
 * Why a separate entry rather than the real bootstrap.ts:
 *   - bootstrap.ts uses Commander to parse argv and then calls run() —
 *     swapping in fakes from outside the process is impossible (module-level
 *     overrides don't cross process boundaries).
 *   - Tests want an offline, deterministic boot. test-entry sets up the
 *     fakes BEFORE the App mounts so the controller never tries to spawn
 *     a real claude subprocess.
 *
 * Tracking bead: km-silvercode.test-process-harness
 */

import "../../src/debug-log.ts"

import React from "react"
import type { AgentSession } from "@km/agent-harness"
import { run } from "silvery/runtime"
import { App } from "../../src/App.tsx"
import { createFakeSession } from "../../src/test/fake-session.ts"
import { installFakes, type AccountScenario } from "../../src/test/fake-boundaries.ts"

function readBool(name: string): boolean {
  const v = process.env[name]
  return v === "1" || v === "true"
}

function readStr(name: string, fallback: string): string {
  const v = process.env[name]
  return v && v.length > 0 ? v : fallback
}

function readAccountScenario(): AccountScenario | undefined {
  const raw = process.env.SILVERCODE_TEST_FAKE_ACCOUNT_JSON
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as AccountScenario
  } catch {
    // Fall through to default scenario; harness gets a deterministic UI even
    // if the env var was malformed.
    return undefined
  }
}

async function main(): Promise<void> {
  // Install fakes BEFORE App mounts so controller boundaries (account,
  // version, branch) never touch the real env. fsRoot is allocated to a
  // temp dir so disk-cache writes stay isolated per spawn.
  installFakes({ account: readAccountScenario() })

  // Single shared fake session for every spawnSession() request the
  // controller makes. The harness can't reach into the subprocess to
  // emit events on it; the test surface here is "did the UI render
  // correctly when controller bootstraps a fresh session" — which is
  // exactly the cursor-startup symptom we need to capture.
  const fake = createFakeSession()

  const layout = readStr("SILVERCODE_TEST_LAYOUT", "single") as "single" | "grid-2" | "grid-4"
  const track = readStr("SILVERCODE_TEST_TRACK", "claude") as "claude" | "sdk" | "codex"

  const handle = await run(
    <App
      cwd={readStr("SILVERCODE_TEST_CWD", process.cwd())}
      bare={readBool("SILVERCODE_TEST_BARE")}
      layout={layout === "grid-2" || layout === "grid-4" ? layout : "single"}
      track={track === "sdk" || track === "codex" ? track : "claude"}
      model={readStr("SILVERCODE_TEST_MODEL", "claude-sonnet-4-6")}
      spawnFactory={() => fake as unknown as AgentSession}
    />,
    { mode: "fullscreen", handleTabCycling: false },
  )
  await handle.waitUntilExit()
}

await main()
