---
id: "@km/silvery/site"
aliases:
  - km-silvery.site
  - km-silvery-site
created_by: claude:55df8ef1
created_at: 2026-03-09T18:21:54Z
closed_at: 2026-03-10T01:54:33Z
close_reason: "Restructured silvery.dev: 'Better Ink' homepage hero, Getting
  Started (Quick Start, Migrate from Ink/Chalk), Guides (Terminal Apps,
  Components, Theming, State Management, Future Targets), Reference (Components
  & Hooks, Packages, Compatibility), Blog. 12 new files, zero deletions. Build
  passes."
---

# [x] silvery.dev: restructure site for multi-target and ink/chalk compat messaging @km/silvery #task #P3

Restructure silvery.dev for the new positioning.

## Messaging (updated)

**Tagline**: Something playing on 'silvery' — the shiny new renderer. Ideas:
- "The silver lining for your terminal UI"
- "A shinier way to render"
- "Your UI, polished"

**Positioning hierarchy**:
1. **Lead**: Better ink/chalk — drop-in replacement that's faster, cleaner, more capable
2. **Secondary**: Cross-platform rendering (terminal now, browser/canvas/native later)
3. **Tertiary**: TEA state management as a nice gradual migration path (optional, not core)

TEA is de-emphasized — it's an upgrade path for people who want it, not a prerequisite. The core pitch is: silvery is the better ink. Same API (via compat), better internals, with a path to rendering anywhere.

## Key changes from current site

- Homepage: lead with ink/chalk replacement story, not TEA architecture
- 'Migrate from Ink' and 'Migrate from Chalk' as prominent getting-started paths
- TEA moves to an optional guide ('State Management'), not top-level architecture
- Benchmarks: silvery vs ink performance comparison
- Theming: integrate swatch docs as silvery.dev/guides/theming
- Package ecosystem page with roadmap badges (stable/beta/planned)

## Site structure

```
silvery.dev/
├── Home                          ← 'Better ink' hero, migration callout
├── Getting Started
│   ├── Quick Start               ← npm i silvery, hello world
│   ├── Migrate from Ink          ← silvery/ink compat, side-by-side diffs
│   └── Migrate from Chalk        ← silvery/chalk compat
├── Guides
│   ├── Terminal Apps             ← @silvery/term basics
│   ├── Components                ← Box, Text, layout
│   ├── Theming                   ← @silvery/theme (ex-swatch docs)
│   ├── State Management          ← TEA as optional upgrade
│   └── Future Targets            ← Browser, canvas, native (roadmap)
├── Reference
│   ├── Components & Hooks
│   ├── Packages
│   └── Ink/Chalk Compatibility   ← API mapping tables
└── Blog                          ← Launch post
```