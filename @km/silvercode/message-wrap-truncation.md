---
id: "@km/silvercode/message-wrap-truncation"
aliases:
  - km-silvercode.message-wrap-truncation
  - km-silvercode-message-wrap-truncation
created_by: claude:2405c72e
created_at: 2026-04-25T07:14:25Z
closed_at: 2026-04-25T15:37:22Z
close_reason: "Closed by 19ea18e21 (Phase 3 of view-as-layout-output).
  MessageList no longer reads useBoxRect().height; ListView is
  height-independent (flex-grow=1 overflow=scroll, index-window virtualization).
  Regression test message-wrap-truncation.test.tsx flipped from test.fails to
  test — passes. 12/12 silvercode visual tests + 45/45 silvery list-view tests
  green. Force-close: parent km-silvery.view-as-layout-output is the
  meta-tracker for the multi-phase work; this leaf bug is fixed by Phase 3 even
  though Phases 4-6 still pending."
started_at: 2026-04-25T15:14:36Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.message-wrap-truncation
    depends_on_id: km-silvercode.wrap-ergonomic
    type: parent-child
    created_at: 2026-04-25T00:14:25Z
    created_by: claude:2405c72e
    metadata: "{}"
  - issue_id: km-silvercode.message-wrap-truncation
    depends_on_id: km-silvery.view-as-layout-output
    type: blocks
    created_at: 2026-04-25T00:14:25Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] [bug] Assistant message paragraphs truncate at 1 line in ListView (wrap broken in production) @km/silvercode #bug #P1 @claude:2405c72e

blocks:: [[@km/silvercode/wrap-ergonomic]], [[@km/silvery/view-as-layout-output]]

## Symptom

Long assistant message paragraphs render as a single truncated line in production silvercode. The user's screenshots show:

\`\`\`
A workspace for agentic knowledge workers: unified notes, tasks, and calendar in a TUI, with bidirectional s
\`\`\`

— cut at "bidi" or "s", with all subsequent text missing. Same for bullets containing long content.

## Diagnosis (verified via repro test)

Failing regression test at \`apps/silvercode/tests/visual/repro-wrap.test.tsx\` isolates the bug:

| Test case | Result |
|---|---|
| AssistantBlock alone (no ListView) | ✅ wraps to 3 lines |
| Outer Box + flexShrink={0} wrapper (mimics ListView shape) | ✅ wraps to 3 lines |
| Real ListView via MessageList | ❌ 1 line, truncated |

So the bug is in **ListView's actual virtualization machinery**, NOT in:
- The flex chain (Prose / minWidth / flexShrink)
- AssistantBlock's structure
- DetectionText's <Prose><Text wrap=wrap></Prose>
- Markdown's parseInline / InlineRun (just shipped, fine in isolation)

## Root cause hypothesis

Same async-layout-signal-propagation pattern as \`km-silvercode.cursor-startup-position\`:

\`MessageList\` reads parent dimensions via \`useBoxRect()\` which returns \`{height: 0}\` on the FIRST render (signal hasn't propagated yet). It passes \`height={Math.max(1, Math.floor(0))} === 1\` to ListView. ListView's viewport is 1 row → content truncated to 1 line. Subsequent re-renders SHOULD use the actual height, but in createRenderer's single-pass test, that follow-up never settles.

In production, the same first-render shows truncation. The user observes it.

A naive fix attempt — passing \`height={9999}\` when measurement is unset — did NOT resolve the bug, suggesting the issue is more nuanced than just height passing. Possibly width is also unsettled, OR ListView's virtualizer locks an item-height assumption from estimateHeight=1 that isn't re-evaluated even after layout settles.

## Test (failing — keep as regression)

\`apps/silvercode/tests/visual/repro-wrap.test.tsx\` — three test cases that prove the bug is in ListView interaction. Should be reduced to two canonical cases (AB-alone passes, MessageList fails) before committing.

## Fix path

Same as \`km-silvery.view-as-layout-output\` — make rect signals propagate synchronously via the layout-signals system rather than via React effect chain. \`useBoxRect\` returns a real value on first render. Both this bug and cursor-startup go away.

OR a tactical fix in ListView: don't use estimateHeight to constrain the item rendering — render at natural height first, virtualize on subsequent passes. Requires careful work in vendor/silvery/.../ListView.tsx.

## Bead links

- Depends on \`km-silvery.view-as-layout-output\` (architectural fix)
- Same root cause class as \`km-silvercode.cursor-startup-position\` (which is also blocked on view-as-layout-output)
- Filed under @km/silvercode/wrap-ergonomic epic alongside Prose primitive (which addresses the flex chain side; this addresses the layout-signal timing side)