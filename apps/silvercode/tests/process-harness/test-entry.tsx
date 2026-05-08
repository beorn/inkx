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
import { bashTool } from "../../src/test/scripts/bashTool.ts"
import { helloWorld } from "../../src/test/scripts/helloWorld.ts"
import { longToolResult } from "../../src/test/scripts/longToolResult.ts"
import { markdownRich } from "../../src/test/scripts/markdownRich.ts"
import { multiTurn } from "../../src/test/scripts/multiTurn.ts"
import { permissionRequest } from "../../src/test/scripts/permissionRequest.ts"
import { welcome } from "../../src/test/scripts/welcome.ts"

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

function readNum(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readScript() {
  switch (process.env.SILVERCODE_TEST_SCRIPT) {
    case undefined:
    case "":
      return null
    case "bashTool":
      return bashTool
    case "helloWorld":
      return helloWorld
    case "longToolResult":
      return longToolResult
    case "markdownRich":
      return markdownRich
    case "multiTurn":
      return multiTurn
    case "permissionRequest":
      return permissionRequest
    case "welcome":
      return welcome
    default:
      return null
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
  // SILVERCODE_TEST_TRACK is a legacy env-driven dispatch knob — values
  // map to canonical agent ids in BUILTIN_AGENTS:
  //   "claude" → "claude-code" (matches the bin's resolved default; the
  //              old `undefined` value pre-dated BUILTIN_AGENTS and now
  //              breaks the welcome H1 — bead km-silvercode.welcome-claude-hardcoded)
  //   "sdk"    → "claude-code-sdk" (in-process SDK)
  //   "codex"  → "codex-spawn"    (legacy stream-json codex)
  const track = readStr("SILVERCODE_TEST_TRACK", "claude")
  const agentForTrack: string = track === "sdk" ? "claude-code-sdk" : track === "codex" ? "codex-spawn" : "claude-code"

  const handle = await run(
    <App
      cwd={readStr("SILVERCODE_TEST_CWD", process.cwd())}
      bare={readBool("SILVERCODE_TEST_BARE")}
      layout={layout === "grid-2" || layout === "grid-4" ? layout : "single"}
      agent={agentForTrack}
      model={readStr("SILVERCODE_TEST_MODEL", "claude-sonnet-4-6")}
      spawnFactory={() => fake as unknown as AgentSession}
    />,
    { mode: "fullscreen", handleTabCycling: false },
  )
  const script = readScript()
  if (script) {
    const delayMs = readNum("SILVERCODE_TEST_SCRIPT_DELAY_MS", 250)
    const intervalMs = readNum("SILVERCODE_TEST_SCRIPT_INTERVAL_MS", 40)
    setTimeout(() => fake.script(script, intervalMs), delayMs)
  }
  await handle.waitUntilExit()
}

await main()
