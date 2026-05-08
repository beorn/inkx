import { createSessionStore, type SessionId, type ToolUseId, type TurnId } from "@km/agent-harness"
import { describe, expect, test } from "vitest"
import type { SessionHandle } from "../src/controller.ts"
import { serializeSessionTranscript } from "../src/session-clipboard.ts"

const sessionId = "session-1" as SessionId

function makeHandle(id = "session-1"): SessionHandle {
  const store = createSessionStore()
  return {
    id,
    name: id,
    session: { sessionId: id },
    store,
    unsubscribe: () => {},
  } as unknown as SessionHandle
}

describe("session clipboard transcript", () => {
  test("serializes projected ChatSession messages and tool refs", () => {
    const handle = makeHandle()
    const userTurnId = "user-1" as TurnId
    const assistantTurnId = "assistant-1" as TurnId
    const toolId = "tool-1" as ToolUseId

    handle.store.apply({
      kind: "session-init",
      sessionId,
      cwd: "/tmp/project",
      model: "test-model",
      mode: "auto",
      tools: [],
      mcp_servers: [],
      slashCommands: [],
      skills: [],
      plugins: [],
      claudeCodeVersion: "",
      apiKeySource: "",
      ts: 1,
    })
    handle.store.apply({ kind: "user-message", sessionId, turnId: userTurnId, text: "Read the file", ts: 2 })
    handle.store.apply({
      kind: "assistant-message",
      sessionId,
      turnId: assistantTurnId,
      content: [
        { type: "text", text: "I'll check it." },
        { type: "thinking", text: "Need the current file contents." },
        { type: "tool_use", id: toolId, name: "Read", input: { file_path: "README.md" } },
        { type: "tool_result", tool_use_id: toolId, output: "Project README", is_error: false },
      ],
      ts: 3,
    })

    expect(serializeSessionTranscript(handle)).toBe(`# Session session-1

Model: test-model

CWD: /tmp/project

Status: idle



## user
Read the file

## assistant
I'll check it.
<thinking>
Need the current file contents.
</thinking>
<tool Read id=tool-1>
{
  "file_path": "README.md"
}
</tool>
<tool_result id=tool-1>
Project README
</tool_result>
`)
  })
})
