---
id: "@km/bearly/recall-memory-framing"
aliases:
  - km-bearly.recall-memory-framing
  - km-bearly-recall-memory-framing
created_by: claude:632692f2
created_at: 2026-04-20T20:52:42Z
---

# [ ] Recall memory injection: XML framing + Haiku rewrite so memory doesn't look like user turns @km/bearly #task #P2

blocks:: [[@km/bearly]]

# Problem

`UserPromptSubmit` hook injects a `## Session Memory` block of `[message] <id>: <snippet>` entries retrieved from the FTS-indexed session history (via `tribe.inject_delta` / `hookRecall`). Because the snippets are raw prompt-like text, Claude Code's transcript renderer makes them look like fresh `Human:` turns. Users report the confusion ("i did not write the User/Human stuff here"), and the LLM's turn-taking reflex sometimes treats recalled memory as if it were a new user message.

Emitter: `vendor/bearly/plugins/recall/src/lib/inject-core.ts:113`. Format today:

```
## Session Memory

[message] abc12345: raw body…
[message] def67890: raw body…
```

## Proposal — two forms, compose

### Form A — Structural framing (free, deterministic)

Wrap the block in a clear XML envelope that tells the model (and anyone reading the transcript) that this is recalled context, not a new message:

```
<recall-memory note="retrospective context from prior sessions — NOT a new user message; do not answer as if asked">
  <snippet type="message" session="abc12345" title="…">
    body
  </snippet>
  <snippet type="plan" session="def67890" title="…">
    body
  </snippet>
</recall-memory>
```

- Zero LLM cost
- Deterministic — just emission format change
- Escape `</snippet>` and `</recall-memory>` in snippet bodies so wrapping doesn't break on self-referential content
- No new dependencies; ships with the inject-core change
- Applies to both daemon (`tribe.inject_delta`) and library (`hookRecall` fallback) paths — inject-core is shared

### Form B — Haiku rewrite (opt-in, later)

For dense snippets (>200 chars or marked interesting), pipe through `claude-haiku-4-5` before injection. Rewrite prompt: "Rewrite this prior exchange into a third-person retrospective summary, 1-2 sentences. Label clearly as recalled memory."

- ~200-500ms added latency per hook firing
- ~$0.0002-0.0010 per firing
- Opt-in via env var: `RECALL_REWRITE_MODEL=claude-haiku-4-5`
- Falls open — on timeout/failure, raw snippet inside the Form A envelope
- Bounded concurrency (rewrite all snippets in parallel, max 3)

Form B is additive — ship Form A first, measure whether B is worth it by user report.

## Acceptance criteria

- `inject-core.ts` emits `<recall-memory>…</recall-memory>` envelope with one `<snippet>` per entry
- Existing tests (`vendor/bearly/plugins/tribe/tests/lore-server.test.ts`, `vendor/bearly/plugins/recall/tests/*`) green — no assertions on the exact `## Session Memory` string
- New test: envelope wraps correctly, body escape preserves all characters except self-terminating tags
- Transcript confusion reduced (user-reported; no automated metric)
- Form B stays on the roadmap but not in this bead

## Not in scope

- Transcript renderer changes (Claude Code owns that; we only control emit format)
- Tribe channel framing (separate — covered by `km-tribe.event-classification`)
- Changing the TTL / dedup / snippet selection logic (separate concern)