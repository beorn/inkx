---
id: "@km/_orphan/nn27p"
aliases:
  - km-nn27p
created_by: claude:2ce3230f
created_at: 2026-03-10T06:25:21Z
closed_at: 2026-03-10T22:57:52Z
close_reason: Work completed and committed as 73de145 in silvery submodule.
  Closing during grooming.
owner: bjorn@stabell.org
---

# [x] Phase 5: Add missing content — limitations, alpha status, community expectations @km/_orphan #task #P2

Add content the docs currently lack for credibility and trust.

## 1. Alpha status in README
Add after the install block:
> **Status:** Alpha — under active development. APIs may change. We welcome early adopters and feedback.

## 2. Known limitations section
Add to README or a dedicated page. Candidates:
- Screen reader support is basic (Ink has ARIA roles; Silvery doesn't yet)
- Community ecosystem is small (30+ built-in components cover most needs, but few third-party packages)
- No concurrent React support yet (Ink has opt-in)
- Canvas/DOM backends are experimental and unpublished
- Windows terminal support caveats (if any)

## 3. "When NOT to use Silvery" 
Surface the silvery-vs-ink "When to Choose What" recommendations earlier — in README or homepage.
Add: "If you need a battle-tested library with 8 years of production use, Ink is the safer choice today."

## 4. Community expectations
Add to README: "Silvery is new — the ecosystem is growing. We've built 30+ components to cover common needs, and we welcome contributions."

## 5. Roadmap visibility
docs/roadmap.md exists but isn't linked from homepage or README. Add links.
Consider adding concrete milestones if available.

## 6. Vision statement
Add to README intro or homepage: "Silvery's goal is to make terminal app development as powerful and ergonomic as building for the web — responsive design, rich components, and smooth interactions."