---
mentions:
  - km
  - Bjørn
id: "@km/bear/dedup-inject"
aliases:
  - km-bear.dedup-inject
  - km-bear-dedup-inject
created_by: Bjørn Stabell
created_at: 2026-04-17T17:37:46Z
closed_at: 2026-04-17T17:49:25Z
close_reason: Phase 5 shipped. bear.inject_delta RPC + MCP tool landed (bearly
  a6ba445, km 8eb990a31). Daemon holds per-session dedup Map in memory with
  10-turn TTL; UserPromptSubmit hook tries daemon first with 2.5s budget, falls
  back to library hookRecall on timeout. 30/30 bear+plugin tests pass, 0 TS
  errors in touched files. Docs (CHANGELOG, README, bearly CLAUDE.md, km
  npm-packages.md, recall SKILL.md) updated. Unrelated 16 km-tui failures from
  concurrent omnibox work — not blockers for this bead.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-bear.dedup-inject
    depends_on_id: km-bear
    type: parent-child
    created_at: 2026-04-17T10:38:03Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-bear.dedup-inject
    depends_on_id: km-bear.summarizer
    type: blocks
    created_at: 2026-04-17T10:38:04Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-bear
      - type: link
        target: km-bear.summarizer
---

# [x] Phase 5: dedup + bear.inject_delta @km/bear #task #P2 @Bjørn Stabell

blocks:: [[@km/bear]], [[@km/bear/summarizer]]

Phase 5 of @km/bear. Move the per-session already-shown dedup set from tmpfiles into daemon memory. Add bear.inject_delta RPC+MCP tool that runs recall, filters against the per-session set, and returns only the delta. Migrate UserPromptSubmit hook to call bear.inject_delta via daemon first, library fallback preserved.

## Acceptance

- New RPC bear.inject_delta, new MCP tool of same name.
- Daemon keeps per-sessionId Map<string, { key → turn }> with TTL 10 turns.
- hooks.ts cmdHook tries daemon first, falls back to existing hookRecall library.
- tmpfile-based dedup still exists as fallback path.
- Tests: daemon inject_delta filters repeats, resets per session.

