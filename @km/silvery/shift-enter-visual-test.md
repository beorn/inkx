---
id: "@km/silvery/shift-enter-visual-test"
aliases:
  - km-silvery.shift-enter-visual-test
  - km-silvery-shift-enter-visual-test
created_by: claude:2405c72e
created_at: 2026-04-26T06:47:45Z
closed_at: 2026-04-26T08:11:31Z
close_reason: "Shipped: silvery 35f493f9. Visual test exposed a real defect
  (Shift+Enter with submitKey=enter dropped the keystroke entirely — neither
  submitted nor inserted newline). Fix: useTextArea.ts:379 newline branch now
  also fires on key.shift. 2 tests. Session: km-session.0425-evening"
started_at: 2026-04-26T07:59:40Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.shift-enter-visual-test
    depends_on_id: km-silvery.architectural-plateau
    type: parent-child
    created_at: 2026-04-25T23:47:52Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Add visual newline-rendering assertion to Shift+Enter test @km/silvery #task #P3 @claude:2405c72e

blocks:: [[@km/silvery/architectural-plateau]]

Existing tests/features/textarea-shift-enter.test.tsx asserts both halves are present in app.text but doesn't verify visual placement. Add a test asserting app.lines[0] contains 'hi', app.lines[1] contains 'yo', no overlap. After Stream L lands, port the /tmp test draft.