---
id: "@km/market/claude-code-outreach"
aliases:
  - km-market.claude-code-outreach
  - km-market-claude-code-outreach
created_by: Bjørn Stabell
created_at: 2026-04-09T21:24:15Z
---

# [ ] Marketing outreach re: Claude Code rendering (NOT READY — human-gated, no auto-execution) @km/market #task #P3

# DO NOT EXECUTE WITHOUT EXPLICIT USER APPROVAL

## Status: HUMAN-GATED. NO AUTO-EXECUTION.

This bead tracks a POSSIBLE future marketing outreach action. It is NOT ready.
It may never be ready. Do not treat this as a TODO that should be drained.

## Hard rules for any Claude session that claims this bead

1. **NEVER post to anthropics/claude-code issues, PRs, or discussions automatically.**
2. **NEVER draft and submit in one go.** Drafting is fine. Submitting requires user typing "file it now" verbatim.
3. **NEVER run `gh issue comment`, `gh pr comment`, or `gh pr create` on external repos without explicit approval per-invocation.**
4. **If user says "work on marketing" or "draft outreach", draft a LOCAL file in `vendor/internal/market/drafts/`. Do not touch GitHub.**
5. If you're about to touch the GitHub CLI for anthropics/*, STOP and ask first. Every time.

## What this bead is for

Tracking the *possibility* of filing a technical comment on anthropics/claude-code#41965 (Claude Code scrollback regression, 1000+ upvotes) as a conceptual reference to silvery's approach to inline incremental rendering.

It is a marketing action, not a doc task. Kept under @km/market (not @km/silvery/positioning) specifically to prevent it being swept into "positioning work" by a session working on docs.

## Why it is NOT ready

- Risk of sounding like sales: high
- Risk of timing being wrong (Claude Code team might be actively fixing): high
- Risk of being read as piling on: high
- Reward (awareness) is marginal vs the downside of a tone-deaf comment

## If and when it becomes ready (requires all of these)

- [ ] silvery.dev has a live demo page showing inline incremental scrollback in action
- [ ] User explicitly says "I want to reach out about this"
- [ ] User reviews full draft word-by-word in a local file
- [ ] User confirms tone (technical, collegial, no sales, acknowledges Ink team's work)
- [ ] User confirms the comment links ONLY to silvery.dev + a public demo page (no source code, no line numbers, no commit SHAs, no test file paths)
- [ ] User confirms chrislloyd's HN comment is referenced respectfully
- [ ] User explicitly types "file it now" (verbatim phrase) before any `gh` command runs

## Draft notes (NOT for publishing — local workspace only)

The architectural points that COULD be made, at conceptual level only:

1. Cell-level buffer (2D grid, not string)
2. Layout-first pipeline (layout before content render)
3. Cell-level diff (per-cell, not per-line)
4. Relative cursor addressing (CSI NA/NB/CR/NC for inline mode)

All four are standard techniques — not silvery-proprietary. The comment can explain them as a design reference without leaking implementation details.

## What it is NOT

- Not part of @km/silvery/positioning (that bead is about docs + messaging)
- Not part of the blog post rewrite
- Not a prerequisite for silvery launch
- Not time-sensitive — if we never file this, that's fine

## Related

- @km/silvery/positioning — references this bead as "possible future marketing action, not a dep"
- @km/market — parent epic
- vendor/internal/market/blogs/silvery/claude-code-rendering-dilemma.md — already exists as published-path content; that's the primary channel, not GitHub comments
