/**
 * Hand-rolled `MessageEntry[]` fixtures for storybook SessionUpdateList stories.
 *
 * The shape mirrors `session-store.ts MessageEntry` exactly. Kept inline
 * (not loaded via `loadFixture`) because SessionUpdateList consumes the
 * post-aggregation shape, not the raw event-stream shape — fake-fixtures
 * are events, not messages.
 */
import type { MessageEntry } from "@km/agent-harness"

const NOW = 1_700_000_000_000
const tid = (n: number) => `t${n}` as MessageEntry["id"]

/** Empty conversation — no messages, idle status. */
export const EMPTY: MessageEntry[] = []

/**
 * Multi-turn conversation: user prompt → assistant text + Bash tool call →
 * tool result → assistant follow-up.
 */
export const MULTI_TURN: MessageEntry[] = [
  {
    id: tid(1),
    role: "user",
    text: "list the files in src",
    toolCalls: [],
    toolResults: [],
    ts: NOW,
  },
  {
    id: tid(2),
    role: "assistant",
    text: "Sure — running `ls`.",
    toolCalls: [
      {
        id: "tu_1" as never,
        name: "Bash",
        input: { command: "ls src" },
      },
    ],
    toolResults: [
      {
        id: "tu_1" as never,
        output: "App.tsx\ncontroller.ts\nindex.tsx\ncomponents/",
        is_error: false,
      },
    ],
    ts: NOW + 1_000,
  },
  {
    id: tid(3),
    role: "assistant",
    text: "There are four entries: `App.tsx`, `controller.ts`, `index.tsx`, and the `components/` directory. Want me to recurse into `components/` next?",
    toolCalls: [],
    toolResults: [],
    ts: NOW + 2_500,
  },
]
