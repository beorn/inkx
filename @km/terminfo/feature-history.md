---
id: "@km/terminfo/feature-history"
aliases:
  - km-terminfo.feature-history
  - km-terminfo-feature-history
created_by: claude:f8196c1c
created_at: 2026-03-26T15:33:19Z
owner: bjorn@stabell.org
---

# [ ] Feature history enrichment: origin stories + adoption context for all 148 features @km/terminfo #task #P3

Comprehensive content enrichment across ALL page types — history, stories, tidbits, adoption context.

## Scope

### Features (148)
- history: when introduced, which standard/terminal first
- pitfalls: cross-terminal disagreements, gotchas
- examples: runnable escape sequences
- Priority: bold, bracketed paste, truecolor, OSC 8, Kitty keyboard, alt screen, mouse, sixel

### Terminals (7 app + 5 historical)
- body: expand with origin stories, key milestones, competitive context
- E.g., Ghostty: HashiCorp founder's side project, 3 years private beta
- E.g., Warp: VC-funded, blocks-based UI, AI integration controversy
- E.g., iTerm2: George Nachman's decade+ solo project, pioneered shell integration

### Frameworks (6)
- body: expand with creation stories, design philosophy origins
- E.g., Ink: vadimdemedes' React-for-CLI idea in 2017
- E.g., Bubbletea: Charm's Go ecosystem (Lip Gloss, Bubbles, Wish)
- E.g., Ratatui: community fork of abandoned tui-rs

### Fundamentals (5 pages)
- Add historical context: who invented the PTY? When did stty first appear?
- TTY: the word 'tty' comes from teletypewriter (1900s Baudot machines)
- stty: stty dates back to Version 1 Unix (1971)
- Control chars: ASCII committee (1963), Bob Bemer's contributions

### Standards (10 sections)
- Already enriched this session — verify completeness

### Baselines (4)
- Add context about why each tier exists, what drove the thresholds

## Approach
Use /marketing enrich workflow + web research for facts. AI drafts, human reviews.