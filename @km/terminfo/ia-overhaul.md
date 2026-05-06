---
mentions:
  - km
  - claude
id: "@km/terminfo/ia-overhaul"
aliases:
  - km-terminfo.ia-overhaul
  - km-terminfo-ia-overhaul
created_by: claude:f8196c1c
created_at: 2026-03-26T17:27:15Z
closed_at: 2026-03-26T18:08:09Z
close_reason: "Full IA overhaul shipped: /terminal/ → /terminals/ rename,
  grouped nav (App Terminals/Headless Backends/Multiplexers/Historical),
  standards body enrichment with historical context, /terminals + /backends +
  /multiplexers index pages, cross-links on ambiguous entities, 116 glossary
  entries, homepage explore cards + mux section, meta description HTML fix, cmux
  cleanup, vterm-js + gnu-screen slug fixes."
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] terminfo.dev information architecture overhaul @km/terminfo #task #P2 @claude:f8196c1c

Full IA redesign based on GPT Pro review v3 + audit findings.

## Problem

The site has grown from a probe matrix into a hybrid reference/education site, but the IA hasn't kept up:

- Name collisions: VT100 = standard + historical terminal + JS library. Same for xterm, kitty.
- Taxonomy soup: nav/sidebar mixes app terminals, headless libraries, and multiplexers in one flat list.
- No cross-linking between related entities (VT100 standard doesn't link to VT100 historical or vt100.js).
- Homepage is just the matrix — no entry points to rich content (fundamentals, standards, historical).
- P0 bug: transformPageData uses linkified HTML as meta description → garbled text on /vt100 and other pages.
- linkify-content.ts escaping is incomplete (only escapes quotes, not &/</>).

## Plan

### Phase 1: Fix broken things (P0/P1)

- [ ] Strip HTML from meta descriptions in transformPageData
- [ ] Fix linkify-content.ts escaping (add full escapeAttr)
- [ ] Remove duplicate Cursor entry in terminals.json

### Phase 2: Navigation restructuring

- [ ] Group nav Terminals dropdown into: App Terminals / Libraries / Multiplexers / Historical
- [ ] Group sidebar similarly (subsections within Terminals)
- [ ] Add terminal type labels to terminal pages (badge: App Terminal / Library / Multiplexer / Historical)

### Phase 3: Disambiguation & cross-linking

- [ ] Add 'See also' boxes on ambiguous entity pages (VT100, xterm, kitty)
- [ ] Ensure glossary entries link to the right target for each bare name
- [ ] Add xterm.js, Kitty, Ghostty, WezTerm, Alacritty, tmux to glossary.json

### Phase 4: Homepage enhancement

- [ ] Add 'Explore' card grid below the matrix (Fundamentals, Standards, Historical, Baselines, Glossary, Compare)
- [ ] Keep it below the fold — matrix stays primary

### Phase 5: Steering docs update

- [ ] Update CLAUDE.md with IA entity taxonomy
- [ ] Update /marketing skill workflows for new nav structure
- [ ] Update content generation flow documentation
- [ ] Verify all page types documented in CLAUDE.md match reality

## Design doc

docs/reviews/ia-design-2026-03-26.md

