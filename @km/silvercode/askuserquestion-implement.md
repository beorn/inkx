---
id: "@km/silvercode/askuserquestion-implement"
aliases:
  - km-silvercode.askuserquestion-implement
  - km-silvercode-askuserquestion-implement
created_by: claude:2405c72e
created_at: 2026-04-28T19:35:20Z
closed_at: 2026-04-28T21:58:20Z
close_reason: "AskUserQuestion now surfaces as InlineAskUserQuestionPrompt
  SelectList overlay (mirrors InlinePermissionPrompt pattern). Composer disabled
  while active. Enter dispatches via controller.respondAskUserQuestion
  (synthetic tool-result + follow-up user message); Esc dispatches
  controller.cancelAskUserQuestion. Reducer parses AskUserQuestionInput schema
  into typed PendingQuestion; defensive on malformed input. Tests:
  apps/silvercode/packages/agent-harness/tests/ask-user-question.test.ts (7),
  apps/silvercode/tests/inline-ask-user-question.test.tsx (4). Files:
  apps/silvercode/packages/agent-harness/src/session-types.ts,
  session-reducer.ts, index.ts;
  apps/silvercode/src/components/InlineAskUserQuestionPrompt.tsx;
  apps/silvercode/src/controller.ts; apps/silvercode/src/App.tsx;
  apps/silvercode/storybook/support/fake-session-handle.ts. Pushed:
  feat/km-silvercode.askuserquestion-implement @
  d10f4d7a8a07f64ffaaf0e5c86d7c8fd6d343ae6."
started_at: 2026-04-28T21:44:09Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.askuserquestion-implement
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T12:35:20Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Implement AskUserQuestion tool properly — currently fails, agent falls back to inline prose @km/silvercode #feature #P0 @claude:2405c72e

blocks:: [[@km/silvercode]]

Screenshot evidence: 'AskUserQuestion tool isn't responding, asking directly' followed by inline options that the user can't actually interact with. The tool call fails silently and the agent improvises.

Investigation needed:
- Where is AskUserQuestion handled in the agent-harness / claude-acp wire?
- Does the legacy stream-json adapter dispatch it? Does the ACP path?
- Compare against Claude Code's native AskUserQuestion behavior (interactive option list with arrow-key + Enter).

Implementation:
- Surface AskUserQuestion as a SelectList overlay (similar shape to InlinePermissionPrompt, sits above composer).
- options[] from the tool input → SelectList items.
- Enter on focused option → respondToolCall with {answer: option.label} (or however Claude Code expects it; check the tool schema).
- Esc → respond with 'cancelled'.
- Composer disabled while AskUserQuestion is active.

Acceptance:
- AskUserQuestion tool call no longer auto-cancels / falls through to prose
- Inline UI lets the user pick an option; the agent receives the selected answer
- termless test: agent invokes AskUserQuestion, UI renders option list, user presses Down + Enter, tool result contains the chosen answer