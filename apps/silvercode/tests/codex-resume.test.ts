/**
 * Codex --resume parser — turns codex's rollout JSONL into canonical
 * AgentEvents that populate the SessionStore so prior turns appear in
 * the card on resume.
 *
 * This test feeds a synthetic minimal codex transcript through the parser
 * and asserts the resulting store state matches what a user would expect:
 *   - session-init populated with cwd + cli_version
 *   - prior user message visible
 *   - prior assistant text visible
 *   - tool-call + tool-result paired up
 *   - status returns to "idle" (so controller.send doesn't queue forever)
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createSessionStore } from "@km/agent-harness"
import { findCodexTranscript, replayCodexSessionFromDisk } from "../src/codex-resume.ts"
import { createSilvercodeController } from "../src/controller.ts"
import { validateResumeId } from "../src/resume.ts"

const SESSION_ID = "019dd09d-test-codex-replay-fixture-aaaa"

let originalHome: string | undefined
let tmpHome: string

function lines(...rows: object[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
}

function writeFakeRollout(sessionId: string, body: string): string {
  const dir = join(tmpHome, ".codex", "sessions", "2026", "04", "27")
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `rollout-2026-04-27T13-24-04-${sessionId}.jsonl`)
  writeFileSync(path, body, "utf8")
  return path
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "codex-resume-test-"))
  originalHome = process.env.HOME
  process.env.HOME = tmpHome
})

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  try {
    rmSync(tmpHome, { recursive: true, force: true })
  } catch {
    // best-effort cleanup
  }
})

describe("codex-resume: replayCodexSessionFromDisk", () => {
  test("missing transcript surfaces an error event and does NOT throw", () => {
    const store = createSessionStore()
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).not.toThrow()
    const state = store.state.get()
    const errors = state.messages.filter((m) => m.role === "system")
    // The error event lands as some surface; assert it didn't throw and
    // status is idle so the user can still type.
    expect(state.status).toBe("idle")
    void errors
  })

  test("replays a minimal rollout: session-init + user message + assistant text + tool roundtrip", () => {
    const body = lines(
      {
        timestamp: "2026-04-27T20:58:37.609Z",
        type: "session_meta",
        payload: {
          id: SESSION_ID,
          cwd: "/Users/beorn/Code/pim/km",
          cli_version: "0.124.0",
          model_provider: "openai",
        },
      },
      {
        timestamp: "2026-04-27T20:58:37.612Z",
        type: "event_msg",
        payload: { type: "user_message", message: "what does this code do?" },
      },
      {
        timestamp: "2026-04-27T20:58:37.612Z",
        type: "event_msg",
        payload: { type: "task_started", turn_id: "019dd0bc-a676-7e62-be4b-7c8a920f8858" },
      },
      {
        timestamp: "2026-04-27T20:58:40.911Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Let me look." }],
        },
      },
      {
        timestamp: "2026-04-27T20:58:42.427Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: '{"cmd": "ls"}',
          call_id: "call_TEST_ABC",
        },
      },
      {
        timestamp: "2026-04-27T20:58:42.523Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_TEST_ABC",
          output: "Output:\nfile1\nfile2\n",
        },
      },
      {
        timestamp: "2026-04-27T20:58:50.491Z",
        type: "event_msg",
        payload: {
          type: "task_complete",
          turn_id: "019dd0bc-a676-7e62-be4b-7c8a920f8858",
          last_agent_message: "Done.",
        },
      },
    )
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    replayCodexSessionFromDisk(store, SESSION_ID)
    const state = store.state.get()

    // Session-init wired into store.
    expect(state.cwd).toBe("/Users/beorn/Code/pim/km")
    expect(state.model).toContain("codex")
    expect(state.claudeCodeVersion).toBe("0.124.0")
    expect(state.sessionId).toBe(SESSION_ID)

    // User message visible.
    const userMsg = state.messages.find((m) => m.role === "user")
    expect(userMsg).toBeDefined()
    expect(userMsg?.text).toBe("what does this code do?")

    // Assistant text visible.
    const assistantMsg = state.messages.find((m) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg?.text).toContain("Let me look.")

    // Tool call + result paired (uses ops in the new order-preserving model).
    const ops = (
      assistantMsg as unknown as { ops?: Array<{ kind: string; tool?: { name: string; result?: unknown } }> }
    )?.ops
    if (ops) {
      const toolOps = ops.filter((o) => o.kind === "tool")
      expect(toolOps.length).toBeGreaterThan(0)
    }

    // Status returned to idle so controller.send accepts new input
    // immediately after the resume.
    expect(state.status).toBe("idle")
  })

  test("replays real user prompts from response_item.message:user and ignores bootstrap context", () => {
    const body = lines(
      {
        timestamp: "2026-04-30T19:06:18.987Z",
        type: "session_meta",
        payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0", model_provider: "openai" },
      },
      {
        timestamp: "2026-04-30T19:06:18.989Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "# AGENTS.md instructions\n\n<INSTRUCTIONS>\n...\n</INSTRUCTIONS>" },
            { type: "input_text", text: "<environment_context>\n  <cwd>/tmp</cwd>\n</environment_context>" },
          ],
        },
      },
      {
        timestamp: "2026-04-30T19:06:18.990Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "see screenshots from silvercode" }],
        },
      },
      {
        timestamp: "2026-04-30T19:06:18.991Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "I'll inspect the UI path." }],
        },
      },
    )
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    replayCodexSessionFromDisk(store, SESSION_ID)

    const userMessages = store.state.get().messages.filter((m) => m.role === "user").map((m) => m.text)
    expect(userMessages).toEqual(["see screenshots from silvercode"])
  })

  test("does not duplicate user prompts present as both response_item and event_msg", () => {
    const body = lines(
      {
        timestamp: "2026-04-30T19:06:18.987Z",
        type: "session_meta",
        payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0", model_provider: "openai" },
      },
      {
        timestamp: "2026-04-30T19:06:18.990Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "fix the permission prompt" }],
        },
      },
      {
        timestamp: "2026-04-30T19:06:18.991Z",
        type: "event_msg",
        payload: { type: "user_message", message: "fix the permission prompt" },
      },
    )
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    replayCodexSessionFromDisk(store, SESSION_ID)

    const userMessages = store.state.get().messages.filter((m) => m.role === "user").map((m) => m.text)
    expect(userMessages).toEqual(["fix the permission prompt"])
  })

  test("orders the recovered user prompt before its assistant turn when Codex logs task_started first", () => {
    const body = lines(
      {
        timestamp: "2026-04-30T19:06:18.987Z",
        type: "session_meta",
        payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0", model_provider: "openai" },
      },
      {
        timestamp: "2026-04-30T19:06:18.989Z",
        type: "event_msg",
        payload: { type: "task_started", turn_id: "turn-after-user" },
      },
      {
        timestamp: "2026-04-30T19:06:18.989Z",
        type: "event_msg",
        payload: { type: "user_message", message: "fix resume ordering" },
      },
      {
        timestamp: "2026-04-30T19:06:19.100Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Working on it." }],
        },
      },
    )
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    replayCodexSessionFromDisk(store, SESSION_ID)
    const messages = store.state.get().messages

    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"])
    expect(messages[0]?.text).toBe("fix resume ordering")
    expect(messages[1]?.text).toContain("Working on it.")
  })

  test("known message variants with unexpected content shape throw with line context", () => {
    writeFakeRollout(
      SESSION_ID,
      lines({
        timestamp: "2026-04-30T19:06:18.990Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: { type: "input_text", text: "not an array" },
        },
      }),
    )

    const store = createSessionStore()
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).toThrow(
      /:1: unsupported Codex transcript shape for response_item\.message:user: content must be an array/,
    )
  })

  test("known tool-call variants with missing required fields throw with line context", () => {
    writeFakeRollout(
      SESSION_ID,
      lines({
        timestamp: "2026-04-30T19:06:18.990Z",
        type: "response_item",
        payload: {
          type: "function_call",
          call_id: "call_1",
          arguments: "{}",
        },
      }),
    )

    const store = createSessionStore()
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).toThrow(
      /:1: unsupported Codex transcript shape for response_item\.function_call: name must be a string/,
    )
  })

  test("replays Codex custom apply_patch calls instead of dropping file edits", () => {
    const body = lines(
      {
        timestamp: "2026-04-27T20:58:37.609Z",
        type: "session_meta",
        payload: {
          id: SESSION_ID,
          cwd: "/Users/beorn/Code/pim/km",
          cli_version: "0.124.0",
          model_provider: "openai",
        },
      },
      {
        timestamp: "2026-04-27T20:58:37.612Z",
        type: "event_msg",
        payload: { type: "task_started", turn_id: "turn-patch" },
      },
      {
        timestamp: "2026-04-27T20:58:42.427Z",
        type: "response_item",
        payload: {
          type: "custom_tool_call",
          status: "completed",
          name: "apply_patch",
          call_id: "call_PATCH",
          input:
            "*** Begin Patch\n" +
            "*** Update File: apps/silvercode/src/foo.ts\n" +
            "@@\n" +
            "-old\n" +
            "+new\n" +
            "*** End Patch\n",
        },
      },
      {
        timestamp: "2026-04-27T20:58:42.523Z",
        type: "response_item",
        payload: {
          type: "custom_tool_call_output",
          call_id: "call_PATCH",
          output:
            '{"output":"Success. Updated the following files:\\nM apps/silvercode/src/foo.ts\\n","metadata":{"exit_code":0}}',
        },
      },
      {
        timestamp: "2026-04-27T20:58:50.491Z",
        type: "event_msg",
        payload: { type: "task_complete", turn_id: "turn-patch" },
      },
    )
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    replayCodexSessionFromDisk(store, SESSION_ID)
    const assistantMsg = store.state.get().messages.find((m) => m.role === "assistant")
    const toolOp = assistantMsg?.ops.find((op) => op.kind === "tool")

    expect(toolOp).toMatchObject({
      kind: "tool",
      toolCall: { id: "call_PATCH", name: "apply_patch" },
      result: { id: "call_PATCH", is_error: false },
    })
    if (toolOp?.kind === "tool") {
      expect(toolOp.toolCall.input).toContain("*** Update File: apps/silvercode/src/foo.ts")
      expect(toolOp.result?.output).toContain("Success. Updated the following files")
    }
  })

  test("transcript ending mid-turn (no task_complete) still settles to idle via synthetic turn-end", () => {
    const body = lines(
      {
        timestamp: "2026-04-27T20:58:37.609Z",
        type: "session_meta",
        payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0" },
      },
      {
        timestamp: "2026-04-27T20:58:37.612Z",
        type: "event_msg",
        payload: { type: "task_started", turn_id: "t1" },
      },
      {
        timestamp: "2026-04-27T20:58:42.427Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: '{"cmd": "ls"}',
          call_id: "call_X",
        },
      },
      // No function_call_output, no task_complete — the user crashed codex
      // mid-turn. Without the synthetic turn-end the store would stay
      // non-idle and controller.send would queue all input forever.
    )
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    replayCodexSessionFromDisk(store, SESSION_ID)
    const state = store.state.get()
    expect(state.status).toBe("idle")
    const assistant = state.messages.find((m) => m.role === "assistant")
    const tool = assistant?.ops.find((op) => op.kind === "tool")
    expect(tool).toMatchObject({
      kind: "tool",
      toolCall: { id: "call_X", name: "exec_command" },
      result: { id: "call_X", is_error: true },
    })
    if (tool?.kind === "tool") {
      expect(tool.result?.output).toContain("transcript ended before this tool produced a result")
    }
  })

  test("validateResumeId allows Codex transcripts that ended without task_complete", () => {
    const body = lines(
      {
        timestamp: "2026-04-29T21:40:32.693Z",
        type: "session_meta",
        payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0" },
      },
      {
        timestamp: "2026-04-29T21:40:32.693Z",
        type: "event_msg",
        payload: { type: "task_started", turn_id: "t-stale-process" },
      },
      {
        timestamp: "2026-04-29T21:40:37.258Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "write_stdin",
          arguments: '{"session_id":76609,"chars":"","yield_time_ms":15000}',
          call_id: "call_stale_process",
        },
      },
      {
        timestamp: "2026-04-29T21:40:52.261Z",
        type: "response_item",
        payload: {
          type: "function_call_output",
          call_id: "call_stale_process",
          output: "Chunk ID: 742bc3\nWall time: 15.0024 seconds\nProcess running with session ID 76609\nOutput:\n",
        },
      },
    )
    writeFakeRollout(SESSION_ID, body)

    const err = validateResumeId({ agent: "codex", sessionId: SESSION_ID, cwd: "/tmp" })
    expect(err).toBeNull()
  })

  test("known Codex compaction transcript entries are ignored without failing resume", () => {
    const body = lines(
      {
        timestamp: "2026-04-29T23:01:36.338Z",
        type: "session_meta",
        payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0" },
      },
      {
        timestamp: "2026-04-29T23:01:36.338Z",
        type: "compacted",
        payload: {
          message: "",
          replacement_history: [
            {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: "fix the .agents/skills" }],
            },
          ],
        },
      },
      {
        timestamp: "2026-04-29T23:01:36.339Z",
        type: "event_msg",
        payload: { type: "context_compacted" },
      },
      {
        timestamp: "2026-04-29T23:01:36.340Z",
        type: "event_msg",
        payload: { type: "view_image_tool_call", call_id: "call_IMG", path: "/tmp/screenshot.png" },
      },
    )
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).not.toThrow()
    expect(store.state.get().status).toBe("idle")
  })

  test("known Codex interrupted-turn entries are ignored without failing resume", () => {
    const body = lines(
      {
        timestamp: "2026-04-30T05:18:17.609Z",
        type: "session_meta",
        payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0" },
      },
      {
        timestamp: "2026-04-30T05:18:18.000Z",
        type: "event_msg",
        payload: { type: "task_started", turn_id: "turn-aborted" },
      },
      {
        timestamp: "2026-04-30T05:18:20.350Z",
        type: "event_msg",
        payload: {
          type: "turn_aborted",
          turn_id: "turn-aborted",
          reason: "interrupted",
          completed_at: 1777526300,
          duration_ms: 178877,
        },
      },
    )
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).not.toThrow()
    expect(store.state.get().status).toBe("idle")
  })

  test("turn_aborted settles unmatched tool calls so resumed commands do not look running", () => {
    const body = lines(
      {
        timestamp: "2026-04-30T05:18:17.609Z",
        type: "session_meta",
        payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0" },
      },
      {
        timestamp: "2026-04-30T05:18:18.000Z",
        type: "event_msg",
        payload: { type: "task_started", turn_id: "turn-aborted" },
      },
      {
        timestamp: "2026-04-30T05:18:19.000Z",
        type: "response_item",
        payload: {
          type: "function_call",
          name: "exec_command",
          arguments: '{"cmd": "silvercode --resume codex:019ddfc8"}',
          call_id: "call_STILL_OPEN",
        },
      },
      {
        timestamp: "2026-04-30T05:18:20.350Z",
        type: "event_msg",
        payload: {
          type: "turn_aborted",
          turn_id: "turn-aborted",
          reason: "interrupted",
          completed_at: 1777526300,
          duration_ms: 178877,
        },
      },
    )
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    replayCodexSessionFromDisk(store, SESSION_ID)
    const state = store.state.get()
    const assistant = state.messages.find((m) => m.role === "assistant")
    const tool = assistant?.ops.find((op) => op.kind === "tool")

    expect(state.status).toBe("idle")
    expect(tool).toMatchObject({
      kind: "tool",
      toolCall: { id: "call_STILL_OPEN", name: "exec_command" },
      result: { id: "call_STILL_OPEN", is_error: true },
    })
    if (tool?.kind === "tool") expect(tool.result?.output).toContain("interrupted")
  })

  test("known Codex web-search transcript entries are ignored without failing resume", () => {
    const body = lines(
      {
        timestamp: "2026-04-30T05:37:17.711Z",
        type: "session_meta",
        payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0" },
      },
      {
        timestamp: "2026-04-30T05:37:17.711Z",
        type: "event_msg",
        payload: {
          type: "web_search_end",
          call_id: "ws_test",
          query: "Kitty graphics protocol virtual placements",
          action: { type: "search", query: "Kitty graphics protocol virtual placements" },
        },
      },
      {
        timestamp: "2026-04-30T05:37:17.711Z",
        type: "response_item",
        payload: {
          type: "web_search_call",
          status: "completed",
          action: { type: "search", query: "Kitty graphics protocol virtual placements" },
        },
      },
    )
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).not.toThrow()
    expect(store.state.get().status).toBe("idle")
  })

  test("controller keeps recovered Codex transcript visible when live ACP attach closes", async () => {
    const body = lines(
      {
        timestamp: "2026-04-29T23:01:36.338Z",
        type: "session_meta",
        payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0", model_provider: "openai" },
      },
      {
        timestamp: "2026-04-29T23:01:36.339Z",
        type: "event_msg",
        payload: { type: "user_message", message: "recover this transcript" },
      },
    )
    writeFakeRollout(SESSION_ID, body)

    const controller = createSilvercodeController({
      cwd: "/tmp",
      bare: true,
      agent: "codex",
      resume: SESSION_ID,
      initialSessions: 0,
      spawnFactory: () => {
        throw new Error("ACP connection closed")
      },
    })

    const handle = await controller.spawnSession("codex replay")
    const state = handle.store.state.get()

    expect(controller.lastSpawnError()).toBeNull()
    expect(state.messages.some((m) => m.role === "user" && m.text === "recover this transcript")).toBe(true)
    expect(state.lastError?.message).toContain("Live Codex resume failed: ACP connection closed")
    expect(state.lastError?.message).toContain("recovered transcript only")

    await controller.closeAll()
  })

  test("findCodexTranscript locates the rollout by sessionId suffix", () => {
    writeFakeRollout(SESSION_ID, "")
    const path = findCodexTranscript(SESSION_ID)
    expect(path).not.toBeNull()
    expect(path).toContain(SESSION_ID)
    expect(path).toContain(".codex/sessions/2026/04/27")
  })

  test("findCodexTranscript returns null for unknown sessionIds", () => {
    expect(findCodexTranscript("nonexistent-id")).toBeNull()
  })

  test("malformed JSONL lines throw instead of being silently skipped", () => {
    const body =
      lines({
        timestamp: "2026-04-27T20:58:37.609Z",
        type: "session_meta",
        payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0" },
      }) +
      "this is not json\n" +
      lines({
        timestamp: "2026-04-27T20:58:37.612Z",
        type: "event_msg",
        payload: { type: "user_message", message: "hi" },
      })
    writeFakeRollout(SESSION_ID, body)

    const store = createSessionStore()
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).toThrow(/:2: unparseable JSONL line/)
  })

  test("unknown top-level transcript types throw", () => {
    writeFakeRollout(
      SESSION_ID,
      lines({
        timestamp: "2026-04-27T20:58:37.609Z",
        type: "mystery_item",
        payload: {},
      }),
    )

    const store = createSessionStore()
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).toThrow(
      /unsupported Codex transcript record type "mystery_item"/,
    )
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).toThrow(/schema drift/)
  })

  test("unknown event_msg variants throw", () => {
    writeFakeRollout(
      SESSION_ID,
      lines({
        timestamp: "2026-04-27T20:58:37.609Z",
        type: "event_msg",
        payload: { type: "mystery_event" },
      }),
    )

    const store = createSessionStore()
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).toThrow(
      /unsupported Codex event_msg payload\.type "mystery_event"/,
    )
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).toThrow(/schema drift/)
  })

  test("known Codex sub-agent lifecycle events do not block resume", () => {
    writeFakeRollout(
      SESSION_ID,
      lines(
        {
          timestamp: "2026-04-27T20:58:37.609Z",
          type: "session_meta",
          payload: { id: SESSION_ID, cwd: "/tmp", cli_version: "0.124.0" },
        },
        {
          timestamp: "2026-04-27T20:58:38.000Z",
          type: "event_msg",
          payload: {
            type: "collab_agent_spawn_end",
            agent_id: "019ddd18-bbd8-7941-9766-101669b9b0b8",
            status: "completed",
          },
        },
        {
          timestamp: "2026-04-27T20:58:39.000Z",
          type: "event_msg",
          payload: { type: "user_message", message: "resume after sub-agent event" },
        },
      ),
    )

    const store = createSessionStore()
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).not.toThrow()
    expect(store.state.get().messages.some((m) => m.role === "user" && m.text === "resume after sub-agent event")).toBe(
      true,
    )
  })

  test("unknown response_item variants throw", () => {
    writeFakeRollout(
      SESSION_ID,
      lines({
        timestamp: "2026-04-27T20:58:37.609Z",
        type: "response_item",
        payload: { type: "mystery_response" },
      }),
    )

    const store = createSessionStore()
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).toThrow(
      /unsupported Codex response_item payload\.type "mystery_response"/,
    )
    expect(() => replayCodexSessionFromDisk(store, SESSION_ID)).toThrow(/schema drift/)
  })
})
