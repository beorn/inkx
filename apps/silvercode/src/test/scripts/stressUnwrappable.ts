/**
 * Stress fixture for `@km/silvercode/post-resize-ui-stability`.
 *
 * Mimics the live-session content shape that triggers 150 STRICT
 * layout-overflow violations during a workspace-switch cascade: long
 * unwrappable tokens (URLs, code-fence lines, hashes) inside the chat,
 * embedded in normal prose. The 336-char silvery-text in the live log
 * was almost certainly one of these natural-width-pinned tokens.
 *
 * Used by `chat-stability.test.tsx` for the cmux-multi-SIGWINCH stress
 * cells. NOT used by visual snapshot tests — content is intentionally
 * wide and ugly.
 */

import type { AgentEvent, SessionId, ToolUseId, TurnId } from "@km/agent-harness"

const SESSION = "fake-stress-unwrappable" as SessionId
const USER_TURN = "u1" as TurnId
const ASSISTANT_TURN = "a1" as TurnId
const TOOL_ID = "toolu_stress_1" as ToolUseId

// 336 chars without breaks — same magnitude as the live STRICT report.
const LONG_URL =
  "https://example.com/extremely/long/path/segment/that/has/no-break-points-anywhere-and-just-keeps-going-because-the-llm-decided-to-paste-a-tracking-link-with-a-multi-segment-id-and-an-anchor-that-is-itself-an-md5-hash-cb6ef82d48a1e4f0a1d2c3b4e5f6a7b8c9d0e1f2-followed-by-some-more-text-just-for-good-measure-and-an-ending-marker-end"

const TOOL_OUTPUT_LINE = `error in /Users/beorn/Code/pim/km/apps/silvercode/src/components/ChatBlockList.tsx:336:18 - LongUnwrappableTokenInsideADeeplyNestedFunctionCall(${LONG_URL.slice(0, 80)}) // 336 cols`

const ASSISTANT_TEXT = `# Stress test — long unwrappable tokens

Here is a long URL the model just emitted: ${LONG_URL}

\`\`\`bash
git log --oneline --all --grep "${LONG_URL.slice(0, 80)}" --since="2024-01-01" --pretty=format:"%h %s %an"
\`\`\`

A normal paragraph follows. It has plenty of breakable words so the wrap
behaviour can be evaluated in isolation. The next line is a hash:

\`\`\`
${LONG_URL.slice(0, 200)}
\`\`\`

The bug shape: long unwrappable text → measured at natural max-content
width → parent flexes around it → breakpoint flips. With many such
tokens in a chat, every SIGWINCH triggers a feedback loop.`

export const stressUnwrappable: ReadonlyArray<AgentEvent> = [
  {
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
    ts: 1000,
  },
  {
    kind: "user-message",
    sessionId: SESSION,
    turnId: USER_TURN,
    text: `please grep ${LONG_URL}`,
    ts: 1010,
  },
  { kind: "turn-start", sessionId: SESSION, turnId: ASSISTANT_TURN, role: "assistant", ts: 1020 },
  {
    kind: "tool-use",
    sessionId: SESSION,
    turnId: ASSISTANT_TURN,
    id: TOOL_ID,
    name: "Bash",
    input: { command: `grep -rn "${LONG_URL}" .` },
    ts: 1030,
  },
  {
    kind: "tool-result",
    sessionId: SESSION,
    id: TOOL_ID,
    output: `${TOOL_OUTPUT_LINE}\n${TOOL_OUTPUT_LINE}\n${TOOL_OUTPUT_LINE}`,
    is_error: false,
    ts: 1100,
  },
  {
    kind: "text-delta",
    sessionId: SESSION,
    turnId: ASSISTANT_TURN,
    blockIndex: 0,
    text: ASSISTANT_TEXT,
    ts: 1200,
  },
  {
    kind: "turn-end",
    sessionId: SESSION,
    turnId: ASSISTANT_TURN,
    stopReason: "end_turn",
    usage: { input_tokens: 100, output_tokens: 200 },
    ts: 1300,
  },
]
