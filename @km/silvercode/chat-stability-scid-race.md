---
aliases:
  - km-silvercode.chat-stability-scid-race
  - km-silvercode-chat-stability-scid-race
created_at: 2026-05-07T01:07:25.690Z
---

# Silvercode: chat-stability tests fail with scid mapping race after deferred-rect #bug #P2

6 chat-stability tests fail with: \`ChatEvent session-init:1000:fake-md-rich:session belongs to fake-md-rich, expected s1\`. Throws from \`apps/silvercode/src/chat/project-transcript.ts:35\` (\`assertSameSession\`).

## Why

Bg agent's deferred-rect work (silvery commits 63938779 + bf0b2f12) added \`settleAfterCommit\` commit-boundary handling. That consumes microtask drains the controller's session-id-prefix mapping (raw "fake-md-rich" → prefixed "s1") was relying on for ordering.

The error pattern: ChatPane projects an event with raw sessionId before the controller's scid mapping is in place. Either:
  - The fake-session script delivers events too eagerly relative to the controller's mapping, OR
  - The projector reads stale state because the controller's setState hasn't committed yet, OR
  - The fake-session's sessionId should be prefix-mapped at fakeSession boundaries before reaching the projector

Tested: render-harness default \`maxLayoutPasses: 5\` (matches pre-unification classic cap) does NOT fix it. The race is in the controller/projector flow, not the pipeline.

## Affected tests

- apps/silvercode/tests/chat-stability.test.tsx (6/6 fail)
- Possibly apps/silvercode/tests/welcome-features.test.tsx (8/30 fail with similar/related symptoms)
- apps/silvercode/tests/visual/* (already-known bg agent harness issue, listed in bg agent's final note)

## Repro

\`\`\`bash
bun vitest run apps/silvercode/tests/chat-stability.test.tsx
\`\`\`

All 6 tests throw the assertSameSession error.

## Probable fix paths

1. **fake-session.ts emits events with the prefixed scid** — the test fixture delivers events using the prefix-mapped id from the start (avoid the race entirely)
2. **ChatPane's projector defensively no-ops on unknown sessionId** — drop events whose sessionId isn't yet in the mapping; controller catches up next render
3. **Controller's mapping is set up synchronously before any event flows** — currently there's a microtask gap

Path 1 is least invasive; path 3 is most architecturally correct.

## Tracks

- @km/silvery/use-deferred-box-rect-and-post-commit-observers (silvery agent's deferred-rect work, 2026-05-06)
- @km/silvery/max-layout-passes-knob (closed; this bead is downstream)
