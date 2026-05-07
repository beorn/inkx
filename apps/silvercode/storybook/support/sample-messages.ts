/**
 * Hand-rolled `MessageEntry[]` fixtures for storybook SessionUpdateList stories.
 *
 * The shape mirrors `session-store.ts MessageEntry` exactly. Kept inline
 * (not loaded via `loadFixture`) because SessionUpdateList consumes the
 * post-aggregation shape, not the raw event-stream shape — fake-fixtures
 * are events, not messages.
 *
 * MessageEntry's `text` / `toolCalls` / `toolResults` are getter-only
 * projections over `ops`; fixtures must populate `ops` directly. Helpers
 * below build entries with the legacy projections installed so they
 * round-trip through SessionUpdateList unchanged.
 */
import type { MessageEntry, MessageOp, ToolCallEntry, ToolResultEntry, ToolUseId } from "@km/agent-harness"

const NOW = 1_700_000_000_000
const tid = (n: number) => `t${n}` as MessageEntry["id"]

/** Build a fixture entry with derived legacy projections installed. */
function makeFixtureEntry(init: {
  id: MessageEntry["id"]
  role: MessageEntry["role"]
  ops: MessageOp[]
  ts: number
  additionalContext?: string
}): MessageEntry {
  const out: Record<string, unknown> = { ...init }
  Object.defineProperty(out, "text", {
    get() {
      let s = ""
      for (const op of (this as { ops: MessageOp[] }).ops) {
        if (op.kind === "text") s += op.text
      }
      return s
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolCalls", {
    get() {
      const arr: ToolCallEntry[] = []
      for (const op of (this as { ops: MessageOp[] }).ops) {
        if (op.kind === "tool") arr.push(op.toolCall)
      }
      return arr
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolResults", {
    get() {
      const arr: ToolResultEntry[] = []
      for (const op of (this as { ops: MessageOp[] }).ops) {
        if (op.kind === "tool" && op.result) arr.push(op.result)
      }
      return arr
    },
    enumerable: true,
    configurable: true,
  })
  return out as unknown as MessageEntry
}

/** Empty conversation — no messages, idle status. */
export const EMPTY: MessageEntry[] = []

/**
 * Multi-turn conversation: user prompt → assistant text + Bash tool call →
 * tool result → assistant follow-up.
 */
export const MULTI_TURN: MessageEntry[] = [
  makeFixtureEntry({
    id: tid(1),
    role: "user",
    ops: [{ kind: "text", text: "list the files in src" }],
    ts: NOW,
  }),
  makeFixtureEntry({
    id: tid(2),
    role: "assistant",
    ops: [
      { kind: "text", text: "Sure — running `ls`." },
      {
        kind: "tool",
        toolCall: {
          id: "tu_1" as ToolUseId,
          name: "Bash",
          input: { command: "ls src" },
        },
        result: {
          id: "tu_1" as ToolUseId,
          output: "App.tsx\ncontroller.ts\nindex.tsx\ncomponents/",
          is_error: false,
        },
      },
    ],
    ts: NOW + 1_000,
  }),
  makeFixtureEntry({
    id: tid(3),
    role: "assistant",
    ops: [
      {
        kind: "text",
        text: "There are four entries: `App.tsx`, `controller.ts`, `index.tsx`, and the `components/` directory. Want me to recurse into `components/` next?",
      },
    ],
    ts: NOW + 2_500,
  }),
]

export const METADATA_NOTIFICATIONS: MessageEntry[] = [
  makeFixtureEntry({
    id: tid(30),
    role: "system",
    ops: [{ kind: "text", text: 'Task completed: Agent "Parser review" completed' }],
    additionalContext: "[result]\nReviewed parser metadata mapping and found no blocking issues.",
    ts: NOW + 30_000,
  }),
  makeFixtureEntry({
    id: tid(31),
    role: "system",
    ops: [{ kind: "text", text: "Edited apps/silvercode/src/components/SessionUpdateList.tsx" }],
    additionalContext: "1→ function BackgroundSystemRow({ text }: { text: string }): React.ReactElement {",
    ts: NOW + 31_000,
  }),
  makeFixtureEntry({
    id: tid(32),
    role: "system",
    ops: [{ kind: "text", text: "Hook context: UserPromptSubmit:add-context" }],
    additionalContext: "extra prompt context from a Claude Code hook",
    ts: NOW + 32_000,
  }),
  makeFixtureEntry({
    id: tid(33),
    role: "system",
    ops: [{ kind: "text", text: "Queued prompt: <task-notification>" }],
    additionalContext: "<task-notification>\n<status>completed</status>\n</task-notification>",
    ts: NOW + 33_000,
  }),
  makeFixtureEntry({
    id: tid(34),
    role: "system",
    ops: [{ kind: "text", text: "Tools available: 18 added" }],
    additionalContext: "Task\nBash\nRead\nEdit",
    ts: NOW + 34_000,
  }),
]

export const LONG_TOOL_SESSION: MessageEntry[] = [
  makeFixtureEntry({
    id: tid(10),
    role: "user",
    ops: [{ kind: "text", text: "Find why resumed Codex sessions lose their hover inspector, then patch it." }],
    ts: NOW + 10_000,
  }),
  makeFixtureEntry({
    id: tid(11),
    role: "assistant",
    ops: [
      { kind: "text", text: "I’ll start by tracing the resume path and the popover wiring." },
      {
        kind: "tool",
        toolCall: {
          id: "tu_read_resume" as ToolUseId,
          name: "Read",
          input: { file_path: "apps/silvercode/src/resume.ts" },
        },
        result: {
          id: "tu_read_resume" as ToolUseId,
          output:
            "export async function validateResumeId(agent: string, id: string) {\n" +
            "  const transcript = await findTranscript(agent, id)\n" +
            "  if (!transcript) throw new Error(`Resource not found: ${id}`)\n" +
            "  return transcript\n" +
            "}\n",
          is_error: false,
        },
      },
      {
        kind: "tool",
        toolCall: {
          id: "tu_grep_popover" as ToolUseId,
          name: "Grep",
          input: { pattern: "usePopoverHandlers|Cmd\\+Shift|RawInspector", path: "apps/silvercode/src" },
        },
        result: {
          id: "tu_grep_popover" as ToolUseId,
          output:
            "apps/silvercode/src/components/SessionUpdateList.tsx:444:function RawInspector\n" +
            "apps/silvercode/src/App.tsx:789:// outside Kitty disambiguation mode\n" +
            "apps/silvercode/src/components/NotificationEventRow.tsx:196:// popover mechanism\n",
          is_error: false,
        },
      },
    ],
    ts: NOW + 11_000,
  }),
  makeFixtureEntry({
    id: tid(12),
    role: "user",
    ops: [{ kind: "text", text: "Also check the storybook layout while you’re in there." }],
    ts: NOW + 18_000,
  }),
  makeFixtureEntry({
    id: tid(13),
    role: "assistant",
    ops: [
      { kind: "text", text: "The story body is still doing some local layout work. I’m going to verify it first." },
      {
        kind: "tool",
        toolCall: {
          id: "tu_test_layout" as ToolUseId,
          name: "Bash",
          input: { command: "bun vitest run apps/silvercode/storybook/tests/stories.test.tsx -t All/together" },
        },
        result: {
          id: "tu_test_layout" as ToolUseId,
          output: "✓ apps/silvercode/storybook/tests/stories.test.tsx (26 tests | 25 skipped)\n",
          is_error: false,
        },
      },
      {
        kind: "tool",
        toolCall: {
          id: "tu_edit_story" as ToolUseId,
          name: "Edit",
          input: {
            file_path: "apps/silvercode/storybook/stories/All.story.tsx",
            old_string: '<Screen flexDirection="row" overflow="hidden">',
            new_string:
              '<Box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} overflow="hidden">',
          },
        },
        result: { id: "tu_edit_story" as ToolUseId, output: "Patch applied.", is_error: false },
      },
    ],
    ts: NOW + 19_000,
  }),
  makeFixtureEntry({
    id: tid(14),
    role: "user",
    ops: [{ kind: "text", text: "Run the focused tests and show me any failures." }],
    ts: NOW + 26_000,
  }),
  makeFixtureEntry({
    id: tid(15),
    role: "assistant",
    ops: [
      { kind: "text", text: "One focused test is still red; the user prompt bubble is visible but too wide." },
      {
        kind: "tool",
        toolCall: {
          id: "tu_fail" as ToolUseId,
          name: "Bash",
          input: { command: "bun vitest run apps/silvercode/tests/welcome-features.test.tsx -t 'feature 3'" },
        },
        result: {
          id: "tu_fail" as ToolUseId,
          output:
            "FAIL feature 3 — right-aligned user prompt bubble\n" +
            "AssertionError: expected leftCornerCol to be greater than app.width / 4\n",
          is_error: true,
        },
      },
      { kind: "text", text: "I’ll tighten the cap and re-run it." },
      {
        kind: "tool",
        toolCall: {
          id: "tu_write" as ToolUseId,
          name: "Write",
          input: {
            file_path: "/tmp/silvercode-debug.log",
            content: "prompt bubble width: 75%; max requested cap: <=80%\n",
          },
        },
        result: { id: "tu_write" as ToolUseId, output: "Wrote /tmp/silvercode-debug.log", is_error: false },
      },
    ],
    ts: NOW + 27_000,
  }),
  makeFixtureEntry({
    id: tid(16),
    role: "user",
    ops: [{ kind: "text", text: "Before you finish, scan docs and ask a sub-agent to check for related regressions." }],
    ts: NOW + 34_000,
  }),
  makeFixtureEntry({
    id: tid(17),
    role: "assistant",
    ops: [
      { kind: "text", text: "I’m checking the nearby docs, file set, and a delegated review path." },
      {
        kind: "tool",
        toolCall: {
          id: "tu_glob" as ToolUseId,
          name: "Glob",
          input: { pattern: "apps/silvercode/**/*.{tsx,ts,md}" },
        },
        result: {
          id: "tu_glob" as ToolUseId,
          output:
            "apps/silvercode/src/components/SessionUpdateList.tsx\n" +
            "apps/silvercode/src/components/Welcome.tsx\n" +
            "apps/silvercode/storybook/stories/All.story.tsx\n" +
            "apps/silvercode/storybook/README.md\n",
          is_error: false,
        },
      },
      {
        kind: "tool",
        toolCall: {
          id: "tu_fetch" as ToolUseId,
          name: "WebFetch",
          input: { url: "https://example.com/acp-session-updates" },
        },
        result: {
          id: "tu_fetch" as ToolUseId,
          output: "Fetched reference page. Relevant sections: tool_call, tool_call_update, permission_request.",
          is_error: false,
        },
      },
      {
        kind: "tool",
        toolCall: {
          id: "tu_todo" as ToolUseId,
          name: "TodoWrite",
          input: {
            todos: [
              { content: "Restore user prompts", status: "completed" },
              { content: "Expand storybook session fixture", status: "in_progress" },
              { content: "Run focused tests", status: "pending" },
            ],
          },
        },
        result: { id: "tu_todo" as ToolUseId, output: "Todo list updated.", is_error: false },
      },
      {
        kind: "tool",
        toolCall: {
          id: "tu_task" as ToolUseId,
          name: "Task",
          input: {
            description: "Review storybook session coverage",
            prompt:
              "Check whether the representative session exercises user, assistant, tools, failures, and notification rows.",
          },
        },
        result: {
          id: "tu_task" as ToolUseId,
          output: "Coverage looks broad: read, grep, glob, bash, edit, write, fetch, todo, task, and a failed command.",
          is_error: false,
        },
      },
    ],
    ts: NOW + 35_000,
  }),
  makeFixtureEntry({
    id: tid(18),
    role: "user",
    ops: [{ kind: "text", text: "Clean up any temporary scratch file and then summarize." }],
    ts: NOW + 43_000,
  }),
  makeFixtureEntry({
    id: tid(19),
    role: "assistant",
    ops: [
      {
        kind: "tool",
        toolCall: {
          id: "tu_delete" as ToolUseId,
          name: "Delete",
          input: { path: "/tmp/silvercode-debug.log" },
        },
        result: { id: "tu_delete" as ToolUseId, output: "Removed /tmp/silvercode-debug.log", is_error: false },
      },
      {
        kind: "text",
        text:
          "Summary: the representative session now includes normal chat, tool-heavy work, a failed command, " +
          "file operations, search, fetch, todo planning, sub-agent output, and notifications interleaved in the transcript.",
      },
    ],
    ts: NOW + 44_000,
  }),
]

export const TURN_ACTIVITY_RICH: MessageEntry[] = [
  makeFixtureEntry({
    id: tid(30),
    role: "user",
    ops: [{ kind: "text", text: "Implement ChatMessageSummary and verify the transcript surface." }],
    ts: NOW + 60_000,
  }),
  makeFixtureEntry({
    id: tid(31),
    role: "assistant",
    ops: [
      { kind: "text", text: "I’m checking the session renderer, adding the component, and running focused tests." },
      {
        kind: "tool",
        toolCall: {
          id: "tu_activity_read_1" as ToolUseId,
          name: "Read",
          input: { file_path: "apps/silvercode/src/components/SessionUpdateList.tsx" },
        },
        result: {
          id: "tu_activity_read_1" as ToolUseId,
          output: "function ExchangeItem(...) {\n  // render text and tool runs\n}\n",
        },
      },
      {
        kind: "tool",
        toolCall: {
          id: "tu_activity_read_2" as ToolUseId,
          name: "Read",
          input: { file_path: "apps/silvercode/src/components/ToolCall.tsx" },
        },
        result: {
          id: "tu_activity_read_2" as ToolUseId,
          output: "export function ToolCall(...) {\n  // hover popover + click expansion\n}\n",
        },
      },
      {
        kind: "tool",
        toolCall: {
          id: "tu_activity_bash_long" as ToolUseId,
          name: "Bash",
          input: { command: "bun vitest run apps/silvercode/tests/chat-message-summary.test.tsx" },
        },
        result: {
          id: "tu_activity_bash_long" as ToolUseId,
          output:
            "RUN  v4.1.4 /Users/beorn/Code/pim/km\n" +
            "✓ ChatMessageSummary keeps a single low-content tool call inline\n" +
            "✓ ChatMessageSummary groups high-content tool work\n" +
            "✓ ChatMessageSummary expands recoverable raw details\n" +
            "Test Files 1 passed\n" +
            "Tests 3 passed\n" +
            "Duration 1.9s\n",
        },
      },
      {
        kind: "tool",
        toolCall: {
          id: "tu_activity_edit" as ToolUseId,
          name: "Edit",
          input: {
            file_path: "apps/silvercode/src/components/SessionUpdateList.tsx",
            old_string: "<ToolCall toolCall={adaptedCall} />",
            new_string: "<ChatMessageSummary items={items} />",
          },
        },
        result: { id: "tu_activity_edit" as ToolUseId, output: "Patch applied.", is_error: false },
      },
      {
        kind: "tool",
        toolCall: {
          id: "tu_activity_todo" as ToolUseId,
          name: "TodoWrite",
          input: {
            todos: [
              { content: "Write focused renderer tests", status: "completed" },
              { content: "Add storybook coverage", status: "in_progress" },
              { content: "Run focused tests", status: "pending" },
            ],
          },
        },
        result: { id: "tu_activity_todo" as ToolUseId, output: "Todo list updated.", is_error: false },
      },
      {
        kind: "tool",
        toolCall: {
          id: "tu_activity_bash_fail" as ToolUseId,
          name: "Bash",
          input: { command: "bun vitest run apps/silvercode/tests/missing.test.tsx" },
        },
        result: {
          id: "tu_activity_bash_fail" as ToolUseId,
          output: "No test files found, exiting with code 1\n",
          is_error: true,
        },
      },
    ],
    ts: NOW + 61_000,
  }),
]

export const TURN_ACTIVITY_NOTIFICATION = [
  {
    kind: "notification" as const,
    id: "notification-turn-activity-1",
    source: "file-watch",
    timestamp: NOW + 60_500,
    content: "apps/silvercode/src/components/SessionUpdateList.tsx changed on disk",
    actionable: true,
  },
  {
    kind: "notification" as const,
    id: "notification-turn-activity-2",
    source: "tribe",
    timestamp: NOW + 61_500,
    content:
      '<channel source="tribe" from="reviewer" type="note">Watch for raw backend labels in the primary row.</channel>',
    actionable: true,
  },
]

const bigTurnOps: MessageOp[] = [
  { kind: "text", text: "I’m going to inspect the layout primitives, then run focused regression tests." },
]
for (let i = 0; i < 4; i++) {
  bigTurnOps.push({
    kind: "tool",
    toolCall: {
      id: `tu_big_rg_${i}` as ToolUseId,
      name: "exec_command",
      input: { cmd: `rg "Content.${i}" apps/silvercode/src apps/silvercode/tests` },
    },
    result: { id: `tu_big_rg_${i}` as ToolUseId, output: `matched file ${i}\n`, is_error: false },
  })
}
bigTurnOps.push({ kind: "text", text: "The search narrows this to transcript rows and the Silvery scroll chrome." })
for (let i = 0; i < 5; i++) {
  bigTurnOps.push({
    kind: "tool",
    toolCall: {
      id: `tu_big_test_${i}` as ToolUseId,
      name: "Bash",
      input: { command: `bun vitest run apps/silvercode/tests/focused-${i}.test.tsx` },
    },
    result: {
      id: `tu_big_test_${i}` as ToolUseId,
      output: i === 4 ? "Test Files 1 passed\nTests 3 passed\n" : "PASS\n",
      is_error: false,
    },
  })
}
bigTurnOps.push({
  kind: "text",
  text: "The collapsed row should stay scannable; expanding it restores this narration and every command.",
})

export const BIG_TOOL_TURN: MessageEntry[] = [
  makeFixtureEntry({
    id: tid(40),
    role: "user",
    ops: [{ kind: "text", text: "Show me how a very large tool-heavy turn behaves." }],
    ts: NOW + 70_000,
  }),
  makeFixtureEntry({
    id: tid(41),
    role: "assistant",
    ops: bigTurnOps,
    ts: NOW + 71_000,
  }),
]
