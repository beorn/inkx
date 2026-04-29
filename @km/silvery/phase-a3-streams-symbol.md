---
id: "@km/silvery/phase-a3-streams-symbol"
aliases:
  - km-silvery.phase-a3-streams-symbol
  - km-silvery-phase-a3-streams-symbol
created_by: claude:019d032d
created_at: 2026-04-23T00:44:23Z
closed_at: 2026-04-23T00:51:36Z
close_reason: Shipped silvery f530f4cf + km bump. Streams under symbols,
  mixed-proxy forwards all symbol lookups, 3 stream-privacy tests + km-tui
  2511/2511 pass.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.phase-a3-streams-symbol
    depends_on_id: km-silvery.phase-a2-backend-term-signals
    type: blocks
    created_at: 2026-04-22T17:44:26Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-silvery.phase-a3-streams-symbol
    depends_on_id: km-silvery.pro-review-p1
    type: parent-child
    created_at: 2026-04-22T17:44:24Z
    created_by: claude:019d032d
    metadata: "{}"
---

# [x] Phase A3: stdin/stdout hidden under Symbol at runtime @km/silvery #task #P2

blocks:: [[@km/silvery/phase-a2-backend-term-signals]], [[@km/silvery/pro-review-p1]]

## What changes
- `packages/ag-term/src/runtime/term-internal.ts` — defines a private Symbol and exports \`getInternalStreams(term)\` that reads them via the symbol.
- `packages/ag-term/src/ansi/term.ts` — every Term factory (createNodeTerm, createHeadlessTerm, createBackendTerm) stores \`stdin\`/\`stdout\` under the Symbol key, NOT as plain \`stdin\`/\`stdout\` enumerable properties.
- Tests: \`(term as any).stdin === undefined && (term as any).stdout === undefined\` — a cast cannot reach the streams any more.

## Delete
- The plain-property version of \`stdin\`/\`stdout\` on termBase.

## /complete grep criteria
- `grep -n "stdin:\|stdout:" vendor/silvery/packages/ag-term/src/ansi/term.ts` shows no plain enumerable \`stdin:\`/\`stdout:\` properties on termBase literals
- `getInternalStreams(term)` continues to return both streams (test)
- `(term as any).stdin` is undefined for all three factories (test)

## Mandatory
Read docs/lessons/refactoring.md IN FULL before writing any code.