---
id: "@km/inkx/docs-overhaul"
aliases:
  - km-inkx.docs-overhaul
  - km-inkx-docs-overhaul
created_by: claude:a7ba47d7
created_at: 2026-02-22T22:15:19Z
closed_at: 2026-02-23T00:29:00Z
---

# [x] inkx docs overhaul: FOSS-ready documentation @km/inkx #task #P3 @claude:ee8efc0f

Comprehensive docs overhaul to make inkx an excellent FOSS project. Based on full audit of all 25+ docs.

## What is Excellent (Keep)
- README.md: problem-driven, clear value prop, quick start
- design.md: five-phase pipeline exhaustively documented
- architecture.md: multi-target RenderAdapter vision
- getting-started.md: perfect beginner progression
- ink-comparison.md: comprehensive feature+perf tables
- roadmap.md: ambitious, well-reasoned tier system

## Tier 1: Critical

1. Create CONTRIBUTING.md (dev setup, testing, commit conventions, PR process)
2. Mark proposal docs as RFC (dom-api-design, mouse-events-design, virtual-columns-design)
3. Link runtime-migration.md from docs/README.md (currently orphaned)
4. Create troubleshooting.md (common issues)
5. Move plugin composition from CLAUDE.md to public docs (withCommands, withKeybindings, withDiagnostics)

## Tier 2: Important (Before 1.0)

6. Expand docs/README.md with audience routing and reading times
7. Create keybindings-guide.md (complete setup example)
8. Create terminal-support-matrix.md
9. Split design.md (860 lines) into terminal-rendering.md and scrolling.md
10. Create CHANGELOG.md

## Tier 3: Nice to Have

11. Interactive docs (xterm.js in browser)
12. Video walkthroughs
13. Auto-generated API reference from TypeScript types
14. FAQ section

## Features in CLAUDE.md Missing from Public Docs

- Plugin composition (withCommands/withKeybindings/withDiagnostics): MISSING
- Driver pattern for testing/AI: MISSING
- withDiagnostics testing invariants: PARTIAL
- Performance optimizations catalog: PARTIAL
- Terminal capabilities detection: PARTIAL

## Deep research report

See docs/ref/inkx-vs-ink-deep-research-2026-02.md for external validation.