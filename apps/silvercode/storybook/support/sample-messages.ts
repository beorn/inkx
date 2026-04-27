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
