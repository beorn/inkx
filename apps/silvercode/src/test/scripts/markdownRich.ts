/**
 * Markdown-rich scenario: assistant turn that exercises every MdBlock kind
 * (heading, paragraph, bullet, ordered, code, quote, rule, tight list).
 *
 * Used by the markdown contract test — rendered through <MarkdownView> at
 * multiple widths (40, 60, 80, 120) to verify wrap behavior, tight-list
 * spacing, code-fence rendering, and heading hierarchy don't regress.
 *
 * Claude often streams real markdown verbatim; bugs show up as: paragraphs
 * breaking mid-word because wrap isn't set, bullet gutters misaligned when
 * content wraps, tight lists getting extra paragraph spacing, tables
 * blowing the column width.
 */

import type { AgentEvent, SessionId, TurnId } from "@km/agent-harness"

const SESSION = "fake-md-rich" as SessionId
const USER_TURN = "u1" as TurnId
const ASSISTANT_TURN = "a1" as TurnId

const MARKDOWN = `# Heading level one

This is a **paragraph** with *italic* and \`inline code\`. It has enough
text to wrap when the column is narrow and it should reflow cleanly across
multiple lines without breaking in the middle of a word.

## Heading level two

- first bullet
- second bullet
- third bullet with **bold** and a long tail that will wrap on a narrow
  terminal so we can verify the bullet gutter stays aligned

### A tight list followed by a paragraph

- tight one
- tight two
- tight three

The paragraph after the tight list should be separated by one blank line.

1. ordered one
2. ordered two
3. ordered three

> This is a blockquote. It should render with a left border in the quote
> style and preserve its line breaks.

\`\`\`typescript
function hello(name: string): string {
  return \`Hi, \${name}!\`
}
\`\`\`

A final paragraph after the fenced code block.`

export const markdownRich: ReadonlyArray<AgentEvent> = [
  {
    kind: "session-init",
    sessionId: SESSION,
    cwd: "/tmp/fake",
    model: "claude-sonnet-4-6",
    mode: "auto",
    tools: [],
    mcp_servers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "2.1.119",
    apiKeySource: "OAuth",
    ts: 1000,
  },
  { kind: "user-message", sessionId: SESSION, turnId: USER_TURN, text: "show me everything", ts: 1010 },
  { kind: "turn-start", sessionId: SESSION, turnId: ASSISTANT_TURN, role: "assistant", ts: 1020 },
  { kind: "text-delta", sessionId: SESSION, turnId: ASSISTANT_TURN, blockIndex: 0, text: MARKDOWN, ts: 1030 },
  { kind: "turn-end", sessionId: SESSION, turnId: ASSISTANT_TURN, stopReason: "end_turn", ts: 1050 },
]
