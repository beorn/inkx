import { describe, expect, test } from "vitest"
import { type AgentEvent, createLineSplitter, createSessionStore, createStreamJsonParser } from "../src/index.ts"

function collect(lines: string[]): AgentEvent[] {
  const events: AgentEvent[] = []
  const p = createStreamJsonParser((e) => events.push(e))
  for (const l of lines) p.push(l)
  return events
}

describe("stream-json parser — M0 fixtures", () => {
  test("system init emits session-init with model + tools", () => {
    const events = collect([
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/work",
        session_id: "sess-1",
        tools: ["Bash", "Edit"],
        mcp_servers: [],
        model: "claude-sonnet-4-6",
        permissionMode: "auto",
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: "session-init",
      sessionId: "sess-1",
      model: "claude-sonnet-4-6",
      mode: "auto",
      cwd: "/work",
      tools: ["Bash", "Edit"],
    })
  })

  test("assistant text stream emits turn-start + deltas + turn-end", () => {
    const events = collect([
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg-1", role: "assistant", content: [] },
        },
        session_id: "sess-1",
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "!" } },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_stop", index: 0 },
      }),
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "message_delta",
          delta: { stop_reason: "end_turn" },
          usage: { input_tokens: 5, output_tokens: 2 },
        },
      }),
    ])

    const kinds = events.map((e) => e.kind)
    expect(kinds).toEqual(["turn-start", "text-delta", "text-delta", "turn-end"])
    expect(events[0]).toMatchObject({ kind: "turn-start", role: "assistant", turnId: "msg-1" })
    expect(events[1]).toMatchObject({ kind: "text-delta", text: "Hi" })
    expect(events[3]).toMatchObject({ kind: "turn-end", stopReason: "end_turn" })
  })

  test("tool_use input_json_delta accumulates into parsed input", () => {
    const events = collect([
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "message_start",
          message: { id: "msg-tool", role: "assistant", content: [] },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: {
          type: "content_block_start",
          index: 0,
          content_block: { type: "tool_use", id: "toolu-1", name: "Bash", input: {} },
        },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"cmd"' } },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: ':"ls"}' } },
      }),
      JSON.stringify({
        type: "stream_event",
        event: { type: "content_block_stop", index: 0 },
      }),
    ])
    // Expect an initial tool-use + a finalized one with parsed input.
    const toolEvents = events.filter((e) => e.kind === "tool-use") as Array<Extract<AgentEvent, { kind: "tool-use" }>>
    expect(toolEvents).toHaveLength(2)
    const last = toolEvents[toolEvents.length - 1]!
    expect(last.name).toBe("Bash")
    expect(last.input).toEqual({ cmd: "ls" })
  })

  test("result event emits session-end with cost + usage", () => {
    const events = collect([
      JSON.stringify({
        type: "result",
        subtype: "success",
        session_id: "sess-1",
        total_cost_usd: 0.0087,
        duration_ms: 1441,
        usage: { input_tokens: 3, output_tokens: 8 },
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: "session-end",
      sessionId: "sess-1",
      costUsd: 0.0087,
      durationMs: 1441,
    })
  })

  test("line splitter handles partial chunks and multi-line batches", () => {
    const received: string[] = []
    const split = createLineSplitter((l) => received.push(l))
    split.push('{"a":1}\n{"b":')
    expect(received).toEqual(['{"a":1}'])
    split.push("2}\n")
    expect(received).toEqual(['{"a":1}', '{"b":2}'])
  })

  test("parse error is surfaced, not thrown", () => {
    const events = collect(["not-json"])
    expect(events[0]?.kind).toBe("error")
  })

  // ── On-disk JSONL replay shape ──────────────────────────────────────────
  // The on-disk transcript at ~/.claude/projects/<proj>/<sid>.jsonl uses a
  // SUPERSET of the live stream-json format. User entries store the raw
  // text Claude Code sent to the model — which embeds the user prompt
  // PLUS <system-reminder>, <command-name>, <command-message>,
  // <command-args>, <local-command-stdout>, <local-command-stderr>
  // wrapper tags, and a top-level `isMeta: true` flag for internal
  // metadata entries like the post-/compact "Caveat" banner.
  //
  // Symptom (bead km-silvercode.resume-renders-system-reminders): on
  // resume, the UI shows the entire wrapped string as if it were the
  // user's message — huge XML blobs, system reminders, Beads context,
  // raw command tags. Scrolling feels "broken" because each "user
  // message" is hundreds of lines tall.
  //
  // Contract: the parser strips wrapper tags, formats /command
  // invocations as `/<name> <args>`, and skips `isMeta:true` entries.
  test("user-message strips <system-reminder> wrapper tags from string content", () => {
    const events = collect([
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content:
            "What is this repo about?\n\n<system-reminder>\ncwd: /Users/beorn/Code/pim/km\n</system-reminder>\n<system-reminder>\nLong beads context here\n</system-reminder>",
        },
        sessionId: "sess-1",
      }),
    ])
    const userEvent = events.find((e) => e.kind === "user-message") as
      | Extract<AgentEvent, { kind: "user-message" }>
      | undefined
    expect(userEvent).toBeDefined()
    expect(userEvent!.text).toBe("What is this repo about?")
    expect(userEvent!.text).not.toContain("<system-reminder>")
    expect(userEvent!.text).not.toContain("cwd:")
    expect(userEvent!.text).not.toContain("Long beads context")
  })

  test("user-message renders /command invocation as '/cmd args' not raw XML tags", () => {
    const events = collect([
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content:
            "<command-message>big</command-message>\n<command-name>/big</command-name>\n<command-args>how would you restructure this repo?</command-args>",
        },
        sessionId: "sess-1",
      }),
    ])
    const userEvent = events.find((e) => e.kind === "user-message") as
      | Extract<AgentEvent, { kind: "user-message" }>
      | undefined
    expect(userEvent).toBeDefined()
    expect(userEvent!.text).toBe("/big how would you restructure this repo?")
    expect(userEvent!.text).not.toContain("<command-")
    expect(userEvent!.text).not.toContain("</command-")
  })

  test("user-message /command with system-reminder embedded in args strips the reminder", () => {
    // Hooks/tools occasionally inject system-reminder blocks INSIDE
    // <command-args> (e.g. bd prime workflow context appended to a /big
    // invocation). Args extraction must also strip those.
    const events = collect([
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content:
            "<command-name>/big</command-name>\n<command-args>real prompt body\n<system-reminder>\n# Beads Workflow Context\nhuge dump\n</system-reminder>\nmore prompt</command-args>",
        },
        sessionId: "sess-1",
      }),
    ])
    const userEvent = events.find((e) => e.kind === "user-message") as
      | Extract<AgentEvent, { kind: "user-message" }>
      | undefined
    expect(userEvent).toBeDefined()
    expect(userEvent!.text).not.toContain("<system-reminder>")
    expect(userEvent!.text).not.toContain("Beads Workflow")
    expect(userEvent!.text).not.toContain("huge dump")
    expect(userEvent!.text).toContain("/big")
    expect(userEvent!.text).toContain("real prompt body")
    expect(userEvent!.text).toContain("more prompt")
  })

  test("user-message with isMeta:true is skipped (no user-message event)", () => {
    const events = collect([
      JSON.stringify({
        type: "user",
        isMeta: true,
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: "Caveat: The messages below were generated by the user while running local commands. DO NOT respond...",
            },
          ],
        },
        sessionId: "sess-1",
      }),
    ])
    expect(events.find((e) => e.kind === "user-message")).toBeUndefined()
  })

  test("user-message strips <local-command-stdout> wrapper tags too", () => {
    const events = collect([
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content:
            "ran /pm\n<local-command-stdout>\nLots of bd output here\nMore output\n</local-command-stdout>\nContinuing",
        },
        sessionId: "sess-1",
      }),
    ])
    const userEvent = events.find((e) => e.kind === "user-message") as
      | Extract<AgentEvent, { kind: "user-message" }>
      | undefined
    expect(userEvent).toBeDefined()
    expect(userEvent!.text).not.toContain("<local-command-stdout>")
    expect(userEvent!.text).not.toContain("Lots of bd output")
    expect(userEvent!.text).toContain("ran /pm")
    expect(userEvent!.text).toContain("Continuing")
  })

  test("user-message strips NESTED system-reminder tags (no orphan close tag leaks)", () => {
    // Real on-disk transcripts contain nested system-reminders — outer
    // wraps an inner task-tools nudge that itself uses system-reminder
    // tags. Non-greedy paired-match leaves an orphan `</system-reminder>`
    // behind unless we ALSO strip leftover orphan open/close tokens.
    const events = collect([
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content:
            "real prompt\n<system-reminder>\nouter\n<system-reminder>\ninner nudge\n</system-reminder>\nmore outer\n</system-reminder>\ntrailing",
        },
        sessionId: "sess-1",
      }),
    ])
    const userEvent = events.find((e) => e.kind === "user-message") as
      | Extract<AgentEvent, { kind: "user-message" }>
      | undefined
    expect(userEvent).toBeDefined()
    expect(userEvent!.text).not.toContain("<system-reminder>")
    expect(userEvent!.text).not.toContain("</system-reminder>")
    expect(userEvent!.text).not.toContain("inner nudge")
    expect(userEvent!.text).not.toContain("more outer")
    expect(userEvent!.text).toContain("real prompt")
    expect(userEvent!.text).toContain("trailing")
  })

  test("user-message with ONLY a system-reminder (no user text) is skipped", () => {
    // After-effect of stripping: if NOTHING remains, don't surface a
    // phantom empty bubble. Real example: hook-only system-reminder
    // entries that exist only to inject context.
    const events = collect([
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: "<system-reminder>\nbd prime context dump\n</system-reminder>",
        },
        sessionId: "sess-1",
      }),
    ])
    expect(events.find((e) => e.kind === "user-message")).toBeUndefined()
  })
})

describe("session-store — event folding", () => {
  test("builds a message from turn-start + text-delta + turn-end", () => {
    const store = createSessionStore()
    const now = Date.now()
    store.apply({
      kind: "session-init",
      sessionId: "s" as never,
      cwd: "/",
      model: "m",
      mode: "auto",
      tools: [],
      mcp_servers: [],
      ts: now,
    })
    store.apply({ kind: "turn-start", sessionId: "s" as never, turnId: "t1" as never, role: "assistant", ts: now })
    store.apply({
      kind: "text-delta",
      sessionId: "s" as never,
      turnId: "t1" as never,
      blockIndex: 0,
      text: "Hello",
      ts: now,
    })
    store.apply({
      kind: "text-delta",
      sessionId: "s" as never,
      turnId: "t1" as never,
      blockIndex: 0,
      text: ", world",
      ts: now,
    })
    store.apply({ kind: "turn-end", sessionId: "s" as never, turnId: "t1" as never, stopReason: "end_turn", ts: now })
    const state = store.state.get()
    expect(state.model).toBe("m")
    expect(state.messages).toHaveLength(1)
    expect(state.messages[0]!.role).toBe("assistant")
    expect(state.messages[0]!.text).toBe("Hello, world")
    expect(state.messages[0]!.stopReason).toBe("end_turn")
    expect(state.status).toBe("idle")
  })

  test("TodoWrite tool-use updates todos", () => {
    const store = createSessionStore()
    const now = Date.now()
    store.apply({ kind: "turn-start", sessionId: "s" as never, turnId: "t1" as never, role: "assistant", ts: now })
    store.apply({
      kind: "tool-use",
      sessionId: "s" as never,
      turnId: "t1" as never,
      id: "tool-1" as never,
      name: "TodoWrite",
      input: { todos: [{ content: "first", status: "in_progress", activeForm: "Doing first" }] },
      ts: now,
    })
    const state = store.state.get()
    expect(state.todos).toEqual([{ content: "first", status: "in_progress", activeForm: "Doing first" }])
    expect(state.status).toBe("tool-running")
  })

  test("tool-result attaches to the originating call", () => {
    const store = createSessionStore()
    const now = Date.now()
    store.apply({ kind: "turn-start", sessionId: "s" as never, turnId: "t1" as never, role: "assistant", ts: now })
    store.apply({
      kind: "tool-use",
      sessionId: "s" as never,
      turnId: "t1" as never,
      id: "tool-1" as never,
      name: "Bash",
      input: { command: "ls" },
      ts: now,
    })
    store.apply({
      kind: "tool-result",
      sessionId: "s" as never,
      id: "tool-1" as never,
      output: "README.md",
      ts: now,
    })
    const msg = store.state.get().messages[0]!
    expect(msg.toolResults).toEqual([{ id: "tool-1", output: "README.md", is_error: undefined }])
  })
})
