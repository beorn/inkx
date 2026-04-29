---
id: "@km/inkz"
aliases:
  - km-inkz
  - "@km/_orphan/inkz"
created_at: 2026-01-17T23:40:47Z
closed_at: 2026-01-19T15:04:19Z
---

# [x] Research: Next-gen TUI renderer (Ink-compatible) @km/inkz #task #P4

## Summary

Research and design for **InkZ** - a next-generation terminal UI renderer that solves Ink's layout feedback problem.

**Repository**: https://github.com/beorn/inkz (private)
**Local path**: `vendor/beorn-inkz/`

## The Problem

Ink renders components *before* layout calculation. Components can't know their dimensions, forcing manual width-prop threading throughout applications.

## The Solution

InkZ calculates layout first, then renders. Components can query their size via `useLayout()`.

## Status

| Phase | Status |
|-------|--------|
| Design & Architecture | Complete |
| Implementation | In Progress |

## Child Beads

### Implementation (P1)
- **@km/inkz/8-reconciler**: Complete reconciler and scheduler implementation
- **@km/inkz/9-examples**: Fix example apps (blocked by reconciler)

### Features (P2)
- **@km/inkz/10-scroll**: Implement overflow="scroll" with virtualization
- **@km/inkz/11-km-migration**: Migrate @km/_orphan/ink to InkZ (blocked by scroll)
- **@km/inkz/12-docs**: Complete documentation site (VitePress + llms.txt)
- **@km/inkz/13-visual-tests**: Visual regression tests (blocked by examples)
- **@km/inkz/14-readme**: Review and update README accuracy

### Validation (P3)
- **@km/inkz/15-compat**: Verify drop-in compatibility against real Ink projects

### Backlog (P4)
- **@km/inkz/16-layout-engine**: Pluggable layout engine (Yoga/Taffy)

## Documentation

All docs in `vendor/beorn-inkz/docs/`:

- **design.md** - Full architecture (5-phase pipeline, API surface)
- **testing.md** - TDD strategy with Ink test triage
- **migration.md** - Moving from Ink to InkZ
- **internals.md** - Implementation details for contributors
- **review.md** - PM/architect review iterations

## Historical Research

- **@km/inkz/1-iteration1**: Initial design iteration
- **@km/inkz/2-iteration2**: Refined design iteration
- **@km/inkz/3-design**: Final design document
- **@km/inkz/4-testing**: Testing strategy
- **@km/inkz/5-review**: Review iterations
- **@km/inkz/6-migration**: Migration guide
- **@km/inkz/7-internals**: Implementation internals
