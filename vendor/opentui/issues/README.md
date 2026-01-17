# OpenTUI Issues Tracking

This folder tracks OpenTUI bugs encountered in the km project, with reproductions and workarounds.

## Issue Index

| ID | Title | Upstream | Status | Workaround |
|----|-------|----------|--------|------------|
| [001](./001-borderstyle-segfault.md) | Invalid borderStyle causes segfault | [#543](https://github.com/anomalyco/opentui/issues/543) | Open | Use valid borderStyle values |
| [002](./002-color-rendering.md) | Named colors render incorrectly | Not filed | Investigating | Use `inverse` styling |

## Environment

- macOS (Apple Silicon) - Darwin arm64
- Bun 1.3.6
- @opentui/core 0.1.73
- @opentui/react 0.1.73

## Workflow

When encountering a new OpenTUI bug:

1. Create issue file: `issues/NNN-short-name.md`
2. Create minimal repro: `issues/NNN-repro.tsx`
3. Search upstream for existing reports
4. File issue if not found (with user permission)
5. Document workaround in the issue file
6. Update this README index

See `.claude/skills/upstream-bug.md` for detailed workflow.
