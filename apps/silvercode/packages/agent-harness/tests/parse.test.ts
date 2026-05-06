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

  test("assistant aggregate with stop_reason=end_turn emits turn-end", () => {
    const events = collect([
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-aggregate",
        message: {
          id: "msg-final",
          role: "assistant",
          content: [{ type: "text", text: "Done." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 2 },
        },
      }),
    ])

    expect(events.map((event) => event.kind)).toEqual(["assistant-message", "turn-end"])
    expect(events[0]).toMatchObject({ kind: "assistant-message", turnId: "msg-final" })
    expect(events[1]).toMatchObject({ kind: "turn-end", turnId: "msg-final", stopReason: "end_turn" })
  })

  test("unknown top-level transcript records surface as raw transcript entries", () => {
    const events = collect([
      JSON.stringify({
        type: "attachment",
        uuid: "att-1",
        attachment: { type: "future_attachment_type", content: "surprise..." },
      }),
    ])

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: "raw-transcript",
      turnId: "att-1",
      label: "Raw attachment future_attachment_type",
    })
  })

  test("trivial successful hook attachments are hidden, meaningful hooks are surfaced", () => {
    const events = collect([
      JSON.stringify({
        type: "attachment",
        uuid: "hook-1",
        attachment: {
          type: "hook_success",
          hookEvent: "PreToolUse",
          hookName: "PreToolUse:Bash",
          stdout: "{}",
          stderr: "",
          content: "",
          exitCode: 0,
        },
      }),
      JSON.stringify({
        type: "attachment",
        uuid: "hook-2",
        attachment: {
          type: "hook_success",
          hookEvent: "UserPromptSubmit",
          hookName: "UserPromptSubmit",
          stdout: "injected context",
          stderr: "",
          content: "injected context",
          exitCode: 0,
        },
      }),
    ])

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: "raw-transcript",
      turnId: "hook-2",
      label: "UserPromptSubmit: UserPromptSubmit",
    })
  })

  test("known Claude transcript metadata gets readable labels and inspectable details", () => {
    const events = collect([
      JSON.stringify({
        type: "agent-name",
        agentName: "claude-f9eb64dc-d982-4a46-9a8e-da5fd882ac5f",
        sessionId: "sess-1",
      }),
      JSON.stringify({
        type: "custom-title",
        customTitle: "f9eb64dc-d982-4a46-9a8e-da5fd882ac5f",
        sessionId: "sess-1",
      }),
      JSON.stringify({
        type: "ai-title",
        aiTitle: "Fix transcript metadata rendering",
        sessionId: "sess-1",
      }),
      JSON.stringify({
        type: "attachment",
        uuid: "edit-1",
        attachment: {
          type: "edited_text_file",
          filename: "/Users/beorn/Code/pim/km/apps/silvercode/src/App.tsx",
          snippet: '1→ import React from "react"',
        },
      }),
      JSON.stringify({
        type: "attachment",
        uuid: "hook-context-1",
        attachment: {
          type: "hook_additional_context",
          hookEvent: "UserPromptSubmit",
          hookName: "UserPromptSubmit:add-context",
          content: ["extra context"],
        },
      }),
      JSON.stringify({
        type: "attachment",
        uuid: "queued-1",
        attachment: {
          type: "queued_command",
          commandMode: "prompt",
          prompt: "<task-notification>\n<status>completed</status>",
          origin: { type: "system" },
        },
      }),
      JSON.stringify({
        type: "attachment",
        uuid: "tools-1",
        attachment: { type: "deferred_tools_delta", addedNames: ["TaskCreate"] },
      }),
      JSON.stringify({
        type: "attachment",
        uuid: "mcp-1",
        attachment: { type: "mcp_instructions_delta", addedNames: ["tribe"], addedBlocks: ["..."] },
      }),
      JSON.stringify({
        type: "attachment",
        uuid: "skills-1",
        attachment: { type: "skill_listing", content: "- docs: write docs\n- tdd: reproduce first" },
      }),
      JSON.stringify({
        type: "attachment",
        uuid: "task-1",
        attachment: { type: "task_reminder", itemCount: 2, content: ["A", "B"] },
      }),
    ])

    expect(events.map((event) => (event.kind === "raw-transcript" ? event.label : event.kind))).toEqual([
      "Agent: claude-f9eb64dc-d982-4a46-9a8e-da5fd882ac5f",
      "Title: f9eb64dc-d982-4a46-9a8e-da5fd882ac5f",
      "AI title: Fix transcript metadata rendering",
      "Edited apps/silvercode/src/App.tsx",
      "Hook context: UserPromptSubmit:add-context",
      "Queued prompt: <task-notification>",
      "Tools available: 1 added",
      "MCP instructions: tribe",
      "Skills listed: 2",
      "Task reminder: 2 items",
    ])
    const edit = events.find(
      (event): event is Extract<AgentEvent, { kind: "raw-transcript" }> =>
        event.kind === "raw-transcript" && event.label.startsWith("Edited "),
    )
    expect(edit?.raw).toContain("import React")
  })

  test("empty startup hook successes stay out of the transcript, meaningful hooks remain inspectable", () => {
    const events = collect([
      JSON.stringify({
        type: "attachment",
        uuid: "session-start-1",
        attachment: {
          type: "hook_success",
          hookEvent: "SessionStart",
          hookName: "SessionStart:startup",
          stderr: "[recall session-start] sentinel=ok\n",
          stdout: "",
          content: "",
          exitCode: 0,
        },
      }),
      JSON.stringify({
        type: "attachment",
        uuid: "prompt-hook-1",
        attachment: {
          type: "hook_success",
          hookEvent: "UserPromptSubmit",
          hookName: "UserPromptSubmit:add-context",
          stdout: "injected context",
          stderr: "",
          content: "injected context",
          exitCode: 0,
        },
      }),
    ])

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: "raw-transcript",
      turnId: "prompt-hook-1",
      label: "UserPromptSubmit: UserPromptSubmit:add-context",
    })
  })

  test("tool_result preserves split stdout/stderr and exit code when Claude records toolUseResult", () => {
    const events = collect([
      JSON.stringify({
        type: "user",
        session_id: "sess-1",
        message: {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "tool-1", content: "combined", is_error: true }],
        },
        toolUseResult: {
          stdout: "visible output",
          stderr: "permission denied",
          exitCode: 9,
        },
      }),
    ])
    expect(events[0]).toMatchObject({
      kind: "tool-result",
      output: { stdout: "visible output", stderr: "permission denied", exitCode: 9 },
      is_error: true,
    })
  })

  test("unknown assistant content blocks become raw ordered ops instead of disappearing", () => {
    const store = createSessionStore()
    const events = collect([
      JSON.stringify({
        type: "assistant",
        sessionId: "sess-raw",
        message: {
          id: "msg-raw",
          role: "assistant",
          content: [{ type: "new_block_type", value: "keep me" }],
        },
      }),
    ])
    for (const event of events) store.apply(event)

    expect(store.state.get().messages[0]?.ops).toMatchObject([
      { kind: "raw", label: "Unknown assistant block new_block_type" },
    ])
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

  test("user-message with isMeta:true emits with empty text + additionalContext (debug view)", () => {
    // isMeta entries are Claude Code internal injections — "Caveat:..."
    // banners, "Continue from where you left off." auto-resume prompts.
    // They aren't user input but the model received and may have
    // responded to them, so the debug view (/raw) needs to expose them.
    // Visible chat text stays empty; additionalContext carries the body.
    // Bead: km-silvercode.resume-show-everything-collapsed.
    const events = collect([
      JSON.stringify({
        type: "user",
        isMeta: true,
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: "Continue from where you left off.",
            },
          ],
        },
        sessionId: "sess-1",
      }),
    ])
    const userEvent = events.find((e) => e.kind === "user-message") as
      | Extract<AgentEvent, { kind: "user-message" }>
      | undefined
    expect(userEvent).toBeDefined()
    expect(userEvent!.text).toBe("")
    expect(userEvent!.additionalContext).toContain("[isMeta]")
    expect(userEvent!.additionalContext).toContain("Continue from where you left off.")
  })

  test("compact summary user records replay as collapsed metadata, not user prompts", () => {
    const compactText =
      "This session is being continued from a previous conversation that ran out of context.\n\nSummary:\n1. The assistant had been reviewing code."
    const events = collect([
      JSON.stringify({
        type: "user",
        isCompactSummary: true,
        isVisibleInTranscriptOnly: true,
        uuid: "compact-1",
        message: {
          role: "user",
          content: compactText,
        },
        sessionId: "sess-1",
      }),
    ])

    expect(events.some((event) => event.kind === "user-message")).toBe(false)
    const metadataEvent = events.find((e) => e.kind === "raw-transcript") as
      | Extract<AgentEvent, { kind: "raw-transcript" }>
      | undefined
    expect(metadataEvent).toBeDefined()
    expect(metadataEvent!.turnId).toBe("compact-1")
    expect(metadataEvent!.label).toBe("Compact summary")
    expect(metadataEvent!.raw).toBe(compactText)
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

  test("user-message captures stripped wrapper bodies into additionalContext", () => {
    // Stripped system-reminder / hook output is preserved verbatim on
    // the event so the debug view (/raw) can expose what the model
    // actually received. Bead: km-silvercode.resume-show-everything-collapsed.
    const events = collect([
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content:
            "real prompt\n<system-reminder>\ncwd: /work\n</system-reminder>\n<system-reminder>\nbeads context here\n</system-reminder>",
        },
        sessionId: "sess-1",
      }),
    ])
    const userEvent = events.find((e) => e.kind === "user-message") as
      | Extract<AgentEvent, { kind: "user-message" }>
      | undefined
    expect(userEvent).toBeDefined()
    expect(userEvent!.text).toBe("real prompt")
    expect(userEvent!.additionalContext).toBeDefined()
    expect(userEvent!.additionalContext).toContain("[system-reminder]")
    expect(userEvent!.additionalContext).toContain("cwd: /work")
    expect(userEvent!.additionalContext).toContain("beads context here")
  })

  test("task-notification transcript rows are system activity, not user prompts", () => {
    const events = collect([
      JSON.stringify({
        type: "user",
        uuid: "task-row-1",
        message: {
          role: "user",
          content:
            "<task-notification>\n" +
            "<task-id>abc123</task-id>\n" +
            "<tool-use-id>toolu_123</tool-use-id>\n" +
            "<output-file>/tmp/task.output</output-file>\n" +
            "<status>completed</status>\n" +
            '<summary>Agent "Refactor parser" completed</summary>\n' +
            "<result>Long task result body</result>\n" +
            "</task-notification>\n" +
            "Full transcript available at: /tmp/task.output",
        },
        sessionId: "sess-1",
      }),
    ])

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: "raw-transcript",
      turnId: "task-row-1",
      label: 'Task completed: Agent "Refactor parser" completed',
    })
    expect(JSON.stringify(events[0])).not.toContain("<task-notification>")

    const store = createSessionStore()
    for (const event of events) store.apply(event)
    const message = store.state.get().messages[0]
    expect(message).toMatchObject({
      role: "system",
      text: 'Task completed: Agent "Refactor parser" completed',
      additionalContext: expect.stringContaining("Long task result body"),
    })
    expect(message?.additionalContext).not.toContain("<task-notification>")
  })

  test("user-message with no wrapper tags has undefined additionalContext", () => {
    const events = collect([
      JSON.stringify({
        type: "user",
        message: { role: "user", content: "just a plain prompt" },
        sessionId: "sess-1",
      }),
    ])
    const userEvent = events.find((e) => e.kind === "user-message") as
      | Extract<AgentEvent, { kind: "user-message" }>
      | undefined
    expect(userEvent!.text).toBe("just a plain prompt")
    expect(userEvent!.additionalContext).toBeUndefined()
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

  // ── Modern Claude (≥2.1.123) hook-event init timing ─────────────────────
  // Symptom: `claude -p --input-format stream-json …` no longer emits
  //   {"type":"system","subtype":"init",…}
  // until AFTER the first user message arrives on stdin. With stdin held
  // open and idle, claude FIRST emits a sequence of
  //   {"type":"system","subtype":"hook_started",   …, session_id:<UUID>}
  //   {"type":"system","subtype":"hook_response",  …, session_id:<UUID>}
  // for each SessionStart hook, and only later (post-prompt) emits
  // `subtype:"init"`. Without recognizing hook events the parser silently
  // ignores them and the silvercode-claude-acp `newSession` flow stalls
  // until its 30s timeout fires and rejects with "ACP connection closed".
  //
  // Contract: the FIRST hook_started / hook_response event for a given
  // parser instance synthesizes a session-init event using the real
  // `session_id` carried on the hook envelope. Subsequent hook events are
  // ignored (the synthetic init was already emitted). When the real
  // `subtype:"init"` event eventually lands, it ALSO emits a session-init
  // (with the full populated fields — model, tools, slashCommands, etc.)
  // so downstream consumers can refresh metadata that was unknown at
  // hook-event time.
  //
  // Bead: km-silvercode.claude-acp-modern-init-timing.
  test("hook_started synthesizes session-init with real session_id (modern claude ≥2.1.123)", () => {
    const events = collect([
      JSON.stringify({
        type: "system",
        subtype: "hook_started",
        hook_id: "abc-123",
        hook_name: "SessionStart:startup",
        hook_event: "SessionStart",
        uuid: "00000000-0000-0000-0000-000000000001",
        session_id: "f7b851f9-de21-4628-bf3d-8c7fc8751f58",
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: "session-init",
      sessionId: "f7b851f9-de21-4628-bf3d-8c7fc8751f58",
      // Full fields are unknown at hook time — sensible empty defaults.
      model: "",
      tools: [],
      mcp_servers: [],
      slashCommands: [],
      skills: [],
      plugins: [],
    })
  })

  test("hook_response also synthesizes session-init when no init has been seen yet", () => {
    const events = collect([
      JSON.stringify({
        type: "system",
        subtype: "hook_response",
        hook_id: "def-456",
        hook_name: "SessionStart:startup",
        hook_event: "SessionStart",
        output: "noop\n",
        exit_code: 0,
        outcome: "success",
        uuid: "00000000-0000-0000-0000-000000000002",
        session_id: "12345678-aaaa-bbbb-cccc-dddddddddddd",
      }),
    ])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: "session-init",
      sessionId: "12345678-aaaa-bbbb-cccc-dddddddddddd",
    })
  })

  test("multiple hook events emit ONE synthetic session-init, not one per hook", () => {
    // SessionStart fires 4-5 hooks in real claude — we must only synthesize
    // ONE session-init event for newSession to resolve cleanly. Subsequent
    // hook events are silently dropped (they have no useful state to add).
    const lines: string[] = []
    for (let i = 0; i < 4; i++) {
      lines.push(
        JSON.stringify({
          type: "system",
          subtype: i === 0 ? "hook_started" : "hook_response",
          hook_id: `hook-${i}`,
          hook_name: "SessionStart:startup",
          hook_event: "SessionStart",
          uuid: `00000000-0000-0000-0000-00000000000${i}`,
          session_id: "shared-session-uuid-9999",
        }),
      )
    }
    const events = collect(lines)
    const inits = events.filter((e) => e.kind === "session-init")
    expect(inits).toHaveLength(1)
    expect(inits[0]).toMatchObject({ sessionId: "shared-session-uuid-9999" })
  })

  test("real subtype:init that arrives AFTER hook events still emits a full session-init", () => {
    // Once the real init lands (e.g. after a user message has been sent and
    // claude finishes its post-prompt setup), it carries the full metadata
    // (model, tools, slashCommands, plugins). Downstream consumers may need
    // to refresh — so we emit a SECOND session-init with the populated
    // fields. The session_id matches the synthetic one because claude's
    // session_id is stable across the hook → init transition.
    const events = collect([
      JSON.stringify({
        type: "system",
        subtype: "hook_started",
        hook_id: "h1",
        hook_name: "SessionStart:startup",
        hook_event: "SessionStart",
        uuid: "00000000-0000-0000-0000-000000000010",
        session_id: "stable-uuid-7777",
      }),
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/work",
        session_id: "stable-uuid-7777",
        tools: ["Bash", "Edit"],
        mcp_servers: [{ name: "tty" }],
        model: "claude-sonnet-4-6",
        permissionMode: "auto",
        slash_commands: ["/big", "/recall"],
        skills: ["pm"],
        plugins: [{ name: "tribe" }],
        claude_code_version: "2.1.123",
      }),
    ])
    const inits = events.filter((e) => e.kind === "session-init") as Array<
      Extract<AgentEvent, { kind: "session-init" }>
    >
    expect(inits).toHaveLength(2)
    expect(inits[0]).toMatchObject({
      sessionId: "stable-uuid-7777",
      model: "",
      tools: [],
    })
    expect(inits[1]).toMatchObject({
      sessionId: "stable-uuid-7777",
      model: "claude-sonnet-4-6",
      tools: ["Bash", "Edit"],
      slashCommands: ["/big", "/recall"],
      skills: ["pm"],
      plugins: ["tribe"],
      claudeCodeVersion: "2.1.123",
    })
  })

  test("subtype:init received WITHOUT prior hook events still emits a single session-init", () => {
    // Belt-and-suspenders: older claude (<2.1.123) emits init directly with
    // no preceding hook events. The fix must not regress that path.
    const events = collect([
      JSON.stringify({
        type: "system",
        subtype: "init",
        cwd: "/work",
        session_id: "legacy-uuid-1",
        tools: ["Bash"],
        mcp_servers: [],
        model: "claude-3-5-sonnet",
        permissionMode: "auto",
      }),
    ])
    const inits = events.filter((e) => e.kind === "session-init")
    expect(inits).toHaveLength(1)
    expect(inits[0]).toMatchObject({
      sessionId: "legacy-uuid-1",
      model: "claude-3-5-sonnet",
      tools: ["Bash"],
    })
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
      slashCommands: [],
      skills: [],
      plugins: [],
      claudeCodeVersion: "test",
      apiKeySource: "test",
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

  test("TodoWrite tool-use updates canonical session plan and compatibility todos", () => {
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
    expect(state.plan).toMatchObject({
      source: "claude-todowrite",
      entries: [{ content: "first", status: "in_progress", activeForm: "Doing first", order: 0 }],
    })
    expect(state.todos).toEqual([{ content: "first", status: "in_progress", activeForm: "Doing first" }])
    expect(state.status).toBe("tool-running")
  })

  test("provider plan-update events update the same canonical session plan", () => {
    const store = createSessionStore()
    const now = Date.now()
    store.apply({
      kind: "plan-update",
      sessionId: "s" as never,
      source: "acp-plan",
      entries: [
        { content: "first", status: "completed", priority: "high" },
        { content: "second", status: "pending", priority: "medium" },
      ],
      ts: now,
    })

    const state = store.state.get()
    expect(state.plan).toMatchObject({
      source: "acp-plan",
      version: 1,
      entries: [
        { content: "first", status: "completed", priority: "high", order: 0 },
        { content: "second", status: "pending", priority: "medium", order: 1 },
      ],
    })
    expect(state.todos).toEqual([
      { content: "first", status: "completed", activeForm: undefined },
      { content: "second", status: "pending", activeForm: undefined },
    ])
  })

  test("completed provider plans clear compatibility todos", () => {
    const store = createSessionStore()
    const now = Date.now()
    store.apply({
      kind: "plan-update",
      sessionId: "s" as never,
      source: "acp-plan",
      entries: [
        { content: "first", status: "completed" },
        { content: "second", status: "completed" },
      ],
      ts: now,
    })

    const state = store.state.get()
    expect(state.plan).toMatchObject({ status: "completed" })
    expect(state.todos).toEqual([])
  })

  test("update_plan tool-use updates the same canonical session plan", () => {
    const store = createSessionStore()
    const now = Date.now()
    store.apply({ kind: "turn-start", sessionId: "s" as never, turnId: "t1" as never, role: "assistant", ts: now })
    store.apply({
      kind: "tool-use",
      sessionId: "s" as never,
      turnId: "t1" as never,
      id: "tool-1" as never,
      name: "update_plan",
      input: {
        plan: [
          { step: "inspect transcript state", status: "completed" },
          { step: "normalize plan tool", status: "in_progress", priority: "high" },
        ],
      },
      ts: now,
    })

    const state = store.state.get()
    expect(state.plan).toMatchObject({
      source: "codex-plan",
      entries: [
        { content: "inspect transcript state", status: "completed", order: 0 },
        { content: "normalize plan tool", status: "in_progress", priority: "high", order: 1 },
      ],
    })
    expect(state.todos).toEqual([
      { content: "inspect transcript state", status: "completed", activeForm: undefined },
      { content: "normalize plan tool", status: "in_progress", activeForm: undefined },
    ])
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

  // Replay (--resume): on-disk JSONL has aggregate `assistant` entries
  // but no streaming events. assistant-message must derive m.text and
  // m.toolCalls from event.content blocks. Without this, resumed
  // sessions show empty assistant bubbles between user prompts.
  // Bead: km-silvercode.resume-renders-system-reminders.
  test("assistant-message derives text + toolCalls from blocks when streaming events absent", () => {
    const store = createSessionStore()
    const now = Date.now()
    store.apply({
      kind: "assistant-message",
      sessionId: "s" as never,
      turnId: "msg-replay-1" as never,
      content: [
        { type: "text", text: "Final aggregate text." },
        { type: "tool_use", id: "tu-1" as never, name: "Bash", input: { command: "ls" } },
      ],
      ts: now,
    })
    const msg = store.state.get().messages[0]!
    expect(msg.text).toBe("Final aggregate text.")
    expect(msg.toolCalls).toEqual([{ id: "tu-1", name: "Bash", input: { command: "ls" }, mcp_server: undefined }])
  })

  test("assistant-message preserves live-streamed text (doesn't overwrite from blocks)", () => {
    // Live path: text-delta builds m.text incrementally before the
    // aggregate fires. Aggregate must NOT replace the streamed text
    // (idempotent — content blocks should match).
    const store = createSessionStore()
    const now = Date.now()
    store.apply({
      kind: "turn-start",
      sessionId: "s" as never,
      turnId: "msg-live" as never,
      role: "assistant",
      ts: now,
    })
    store.apply({
      kind: "text-delta",
      sessionId: "s" as never,
      turnId: "msg-live" as never,
      blockIndex: 0,
      text: "STREAMED",
      ts: now,
    })
    store.apply({
      kind: "assistant-message",
      sessionId: "s" as never,
      turnId: "msg-live" as never,
      content: [{ type: "text", text: "STREAMED" }],
      ts: now,
    })
    const msg = store.state.get().messages[0]!
    expect(msg.text).toBe("STREAMED")
  })
})
