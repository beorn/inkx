/**
 * InlinePermissionPrompt — bead km-silvercode.permission-inline-prompt.
 *
 * Replaces the older `permission-auto-surface.test.tsx` modal-popup test.
 *
 * Tests cover both the legacy binary y/n flow (driven end-to-end through
 * the real <App/> via termless) and the ACP multi-option flow (driven
 * directly against the component with a synthetic SessionHandle that
 * carries an `options[]` field — the event surface doesn't propagate
 * options yet, so direct mounting is the simplest way to exercise the
 * multi-option branch).
 */

import type { AgentSession, PermissionOptionId, SessionId } from "@km/agent-harness"
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { run } from "silvery/runtime"
import { App } from "../src/App.tsx"
import { InlinePermissionPrompt } from "../src/components/InlinePermissionPrompt.tsx"
import { createFakeSession, type ScriptedFakeSession } from "../src/test/fake-session.ts"
import { installFakes } from "../src/test/fake-boundaries.ts"
import { fakeSessionHandle } from "../../silvercode/storybook/support/fake-session-handle.ts"

const COLS = 120
const ROWS = 40
const SESSION = "fake-permission-1" as SessionId
const REQUEST = "perm-1"

const settle = (ms = 100) => new Promise<void>((r) => setTimeout(r, ms))

type TermlessTerm = ReturnType<typeof createTermless>

function feed(term: TermlessTerm, data: string): void {
  ;(term as unknown as { sendInput: (s: string) => void }).sendInput(data)
}

async function bootAppWithPendingPermission(): Promise<{
  term: TermlessTerm
  fake: ScriptedFakeSession
  handle: Awaited<ReturnType<typeof run>>
  fakes: ReturnType<typeof installFakes>
}> {
  const fakes = installFakes({})
  const fake = createFakeSession({ sessionId: SESSION })
  const term = createTermless({ cols: COLS, rows: ROWS })
  const handle = await run(
    <App
      cwd="/tmp/silvercode-test-inline-perm"
      bare
      layout="single"
      model="claude-sonnet-4-6"
      spawnFactory={() => fake as unknown as AgentSession}
    />,
    term,
  )
  // Let the controller's initial spawn settle.
  await settle(150)
  // Drive a permission-request through the fake session.
  fake.emit({
    kind: "session-init",
    sessionId: SESSION,
    cwd: "/tmp/fake",
    model: "claude-sonnet-4-6",
    mode: "auto",
    tools: ["Bash"],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "2.1.119",
    apiKeySource: "OAuth",
    ts: Date.now(),
  })
  fake.emit({
    kind: "user-message",
    sessionId: SESSION,
    turnId: "u1" as never,
    text: "run dangerous",
    ts: Date.now(),
  })
  fake.emit({
    kind: "turn-start",
    sessionId: SESSION,
    turnId: "a1" as never,
    role: "assistant",
    ts: Date.now(),
  })
  fake.emit({
    kind: "permission-request",
    sessionId: SESSION,
    requestId: REQUEST as never,
    tool: "Bash",
    args: { command: "rm -rf /" },
    ts: Date.now(),
  })
  await settle(120)
  return { term, fake, handle, fakes }
}

describe("InlinePermissionPrompt — legacy binary flow", () => {
  test("y approves the focused session's pending permission", async () => {
    const { term, fake, handle, fakes } = await bootAppWithPendingPermission()
    try {
      // Inline prompt is on screen — action header, shell-command marker,
      // command summary, and binary actions all surface in the rendered frame.
      expect(term.screen).toContainText("Allow Run bash?")
      expect(term.screen).toContainText("$ rm -rf /")
      expect(term.screen).toContainText(" Yes ")
      expect(term.screen).toContainText("No")
      expect(term.screen).toContainText("rm -rf /")

      // Approve.
      feed(term, "y")
      await settle(120)

      // The fake session received exactly one permission-response with approved=true.
      const responses = fake.sent.filter((s) => s.type === "permission-response")
      expect(responses).toHaveLength(1)
      expect(responses[0]!.payload).toEqual({ id: REQUEST, approved: true })
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })

  test("n denies the focused session's pending permission", async () => {
    const { term, fake, handle, fakes } = await bootAppWithPendingPermission()
    try {
      expect(term.screen).toContainText("Allow Run bash?")

      feed(term, "n")
      await settle(120)

      const responses = fake.sent.filter((s) => s.type === "permission-response")
      expect(responses).toHaveLength(1)
      expect(responses[0]!.payload).toEqual({ id: REQUEST, approved: false })
    } finally {
      handle.unmount()
      fakes.dispose()
    }
  })
})

describe("InlinePermissionPrompt — ACP multi-option flow", () => {
  test("Down + Enter selects the second option and dispatches with the right approved flag", async () => {
    // Direct component test — `state.permissions` doesn't currently carry
    // the ACP `options[]` field through the event surface, so we mount
    // the component against a synthetic handle whose first pending
    // permission has options set. The component reads
    // `(permission as { options?: ... }).options` directly.
    const optAllow = "opt-allow" as PermissionOptionId
    const optReject = "opt-reject" as PermissionOptionId
    const handle = fakeSessionHandle({
      id: "s-multi",
      name: "Multi Session",
      state: {
        status: "awaiting-permission",
        permissions: [
          {
            requestId: REQUEST,
            tool: "Bash",
            args: { command: "rm -rf /" },
            // The component reads options off the entry via cast — wider
            // type than session-store's current shape.
            options: [
              { optionId: optAllow, name: "Allow", kind: "allow_once" },
              { optionId: optReject, name: "Reject", kind: "reject_once" },
            ],
          } as unknown as { requestId: string; tool: string; args: unknown },
        ],
      },
    })

    const calls: Array<{
      sid: string
      rid: string
      optionId: PermissionOptionId
      approved: boolean
    }> = []

    const renderer = createRenderer({ cols: 80, rows: 20 })
    const app = renderer(
      <InlinePermissionPrompt
        focused={handle}
        sessions={[handle]}
        onApprove={() => {}}
        onDeny={() => {}}
        onSelectOption={(sid, rid, optionId, approved) => calls.push({ sid, rid, optionId, approved })}
      />,
    )

    // Both option labels visible in the rendered frame.
    expect(app.text).toContain("Allow Run bash?")
    expect(app.text).toContain("$ rm -rf /")
    expect(app.text).toContain(" Allow ")
    expect(app.text).toContain(" Reject ")

    const headerRow = app.lines.findIndex((line) => line.includes("Allow Run bash?"))
    expect(headerRow).toBeGreaterThanOrEqual(0)
    expect(app.lines[headerRow]!.indexOf("Allow Run bash?")).toBe(3)
    expect(app.cell(79, headerRow).bg).not.toBeNull()

    // Move the SelectList focus down then Enter to select the second option.
    // createRenderer's `app.press` accepts string key names.
    await app.press("ArrowDown")
    await app.press("Enter")

    // The select handler fired with the rejecter option.
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      sid: "s-multi",
      rid: REQUEST,
      optionId: optReject,
      approved: false,
    })
  })
})
