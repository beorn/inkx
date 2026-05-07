---
type: bug
priority: P2
status: open
parent: "@km/silvercode"
created_at: 2026-05-07T05:58:00.000Z
---

# AskUserQuestion replay shows bare "Answer questions?"; cmd-hover lacks raw event JSON

## Symptoms (screenshot 2026-05-06 at 22.54.36, session `0e9413ff-5f95-43ad-a0fa-27bbfaa44dec`)

Two bare lines `Answer questions?` appear in the transcript with no marker, no
question text, no options, and no indication this was a cancelled
`AskUserQuestion` tool call. Cmd-hover over the row shows nothing — it should
expose the full raw event JSON (the tool_use input plus the tool_result
output) for inspection/debugging.

## Reproduction

Replay the JSONL at
`~/.claude/projects/-Users-beorn-Code-pim-km-apps-silvercode/0e9413ff-5f95-43ad-a0fa-27bbfaa44dec.jsonl`.
The relevant pair of events:

- Assistant `tool_use`, `id: toolu_01U92fJrrhcodHfnP4tfyy1g`,
  `name: "AskUserQuestion"`, `input: { questions: [{ question: "How do you
  want me to attack the welcome flicker?", header: "Approach", multiSelect:
  false, options: [{ label: "Land L4 silvery useBoxRect deferred",
  description: "Implement @km/silvery/use-deferred-box-rect-and-post-commit-observers ..." }, ...] }] }`
- Subsequent user message:
  `content: [{ type: "tool_result", tool_use_id:
  "toolu_01U92fJrrhcodHfnP4tfyy1g", content: "Answer questions?", is_error:
  true }]`

Two such pairs occur in the session.

## Diagnosis

Two separate gaps:

### 1. AskUserQuestion is not surfaced in the transcript

Pipeline today (verified by reading code, not theorizing):

- `packages/agent-harness/src/parse.ts:840-849` — for an array-content user
  message containing `tool_result` blocks, parse emits a `kind: "tool-result"`
  event with `output = item.content`, `is_error = true`. No `user-message` is
  emitted (correct: there is no user *text*).
- `src/chat/normalize-agent-event.ts:307-315` — `case "tool-result"` projects
  this to a `tool.completed` `ChatEvent` on channel `"error"` with payload
  `{ toolId, status: "failed", output: "Answer questions?" }`. The matching
  `tool-use` event from the assistant message is projected on channel
  `"activity"` as `tool.started` with `{ name: "AskUserQuestion", input: {...questions...} }`.
- `src/components/SessionUpdateList.tsx` `adaptToolCall` (line 495+) calls
  `toolKindFromName("AskUserQuestion", input)` which falls through to
  `"other"` (no AskUserQuestion case in the switch), so it renders as a
  generic muted tool row. Title comes from `toolTitle("AskUserQuestion",
  input)` which has no special case. The failing result text
  `"Answer questions?"` is what `toolResultContent` surfaces.

End result: the row collapses to the error string `"Answer questions?"`
with no marker, no question text, no options, no cancellation framing.

### 2. cmd-hover is missing on tool rows

`src/components/HoverPreviewTarget.tsx` exists and is wired in some places
(see `src/components/Chat.tsx`, `src/components/Content.tsx`) but
`<ToolCall>` does not register a hover preview target with the raw
`{ rawInput, rawOutput }` payload. Cmd-hover should reveal the JSON of both
the tool_use input and the tool_result output (and `is_error`,
`tool_use_id`, `mcp_server`, etc.) — enough for the user to see exactly
what the agent emitted.

## Acceptance

- [ ] `<ToolCall>` for `name === "AskUserQuestion"` renders a meaningful
      summary line (e.g. `• Asked: "<question>"` with cancellation/answer
      indicator) — `tests/session-update-list.test.tsx` asserts the
      rendered row text against the fixture above and against the
      already-existing `apps/silvercode/packages/agent-harness/src/fake-fixtures/rejection-flow.json`.
- [ ] When `is_error: true` and the result string is `"Answer questions?"`,
      the row is framed as "Cancelled" rather than as a generic failed
      tool, and shows the original question above it (so the transcript
      reads "agent asked X — user cancelled" rather than "tool failed").
- [ ] Cmd-hover (modifier-key + hover) on any tool row reveals a popover
      whose body is the JSON-stringified
      `{ name, input: rawInput, output: rawOutput, is_error, toolUseId }` —
      pretty-printed, scrollable. Verified via a Storybook story driven
      from the same JSONL fixture.
- [ ] Existing `replay` tests continue to pass; add a
      `tests/replay-ask-user-question.test.tsx` driving from the JSONL
      fixture (extracted from `0e9413ff-5f95-43ad-a0fa-27bbfaa44dec.jsonl`,
      trimmed to the AskUserQuestion turn pair).

## Notes

- The `InlineAskUserQuestionPrompt` component handles the *interactive*
  picker for a *live* session; this bead is about the *historical
  transcript* projection. They share the same underlying tool name but
  different render paths.
- Memory ref: `feedback-screenshots-on-desktop` (always check
  `~/Desktop/*.png` when the user mentions a screenshot without a path).
- Authoritative event types: `packages/agent-harness/src/events.ts`
  (`tool-use`, `tool-result`); ChatEvent shapes:
  `src/chat/transcript-types.ts`.
