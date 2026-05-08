---
id: "@km/silvercode/agent-host-l5/04-chat-thread-projection/l5-chatblock-cutover"
---

# [/] L5: ChatPane cutover to projected ChatBlocks from ChatTree #feature #P0

blocks:: [[@km/silvercode/agent-host-l5/08-provider-conformance/parity-claude]]

## Goal

Make `ChatPane` render projected `ChatLeaf`/ChatBlock UI from `ChatSession.tree` as the primary transcript.

## Work

- Bring mature legacy rendering into the projected path: user text, assistant text, reasoning, recap, read/search, patch/edit/diff, command, generic tool, permission, plan, queue, notifications, session/status/usage, file snapshot, hook/MCP/debug, error, unknown Debug payload.
- Preserve Markdown/table wrapping fixes.
- Preserve raw/detail affordances on every nontrivial block.
- Preserve scroll/follow behavior, composer overlay insets, activity summaries, and pending permission UX.
- Keep compare mode only until projected output is same-or-better in replay tests.

## Acceptance

- `SessionUpdateList` no longer owns primary event classification/channel filtering/summary semantics.
- Render tests cover every core ChatLeaf type.
- Visual replay shows same-or-better scanability than Claude Code screenshots.
- Normal mode does not show raw/control noise; Debug mode can inspect it.

## Verification

- `bun vitest run apps/silvercode/tests/chat-block-list.test.tsx apps/silvercode/tests/chat-session-store.test.ts`
- visual replay/termless suite added by this bead.

blocks:: [[@km/silvercode/parity-claude]]

