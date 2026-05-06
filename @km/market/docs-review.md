---
mentions:
  - km
  - claude
id: "@km/market/docs-review"
aliases:
  - km-market.docs-review
  - km-market-docs-review
created_by: claude:4929065a
created_at: 2026-04-01T06:33:37Z
closed_at: 2026-04-01T06:43:29Z
close_reason: "Design docs converted from spec to reference (4 files). Glossary
  expanded: silvery 53→100 terms, termless 47→99 terms. Tooltip-only converted
  to links for all components (→ /components/*), terminal concepts (→
  terminfo.dev), and external tools. Comparison articles fixed (language, links,
  layout-first, better examples). Cross-links added (5 component pages → design
  docs). Bead references removed. Broken table fixed."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] silvery.dev docs review: design docs as reference, glossary expansion, comparison fixes @km/market #task #P2 @claude:4929065a

Comprehensive review of silvery.dev docs from user feedback. Multiple issues:

## Design Docs (spec → reference)

All design docs read like future-facing specs with open questions. Must become reference docs:

- design/dynamic-scrollback — reads like spec, has "Proposed API", diagram lines misaligned
- design/terminal-support-strategy — has "Implementation Roadmap" (move to bead P0), broken table after "What it catches that STRICT can't:", review if doc matches reality
- design/plugin-architecture — says "Status: Implemented" but still reads like a spec
- design/app-composition — reads like design spec, should be reference guide

## Glossary Expansion (50-100 terms)

Current: 53 silvery terms, 47 termless terms. Need:

- Terminal sequences: ED2, ED3, scrollback, inline mode, etc.
- Share terminfo.dev glossary terms with silvery.dev and termless.dev
- Each term should link to terminfo.dev where applicable
- Target: 50-100 terms per site

## Comparison Articles Fixes

- silvery-vs-bubbletea: "External project claims last verified: 2026-03" → use "Information as of March 2026" or similar. Link to each project. Check if useTea() is current. Lead with layout (biggest difference). Show more impressive termless example (scrollback checking).
- Similar review needed for vs-textual and vs-blessed

## Cross-Cutting

- No "beads" mentions anywhere on public sites (grep and remove)
- Prev/Next links need review across all pages
- Design/deep-dive docs should be linked FROM component pages (e.g., ScrollbackList → design/dynamic-scrollback)
- Scan for chalk/ink references that should be updated
- Should have a list of focusable elements somewhere

