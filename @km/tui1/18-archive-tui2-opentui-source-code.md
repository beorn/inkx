---
id: "@km/tui1/18-archive-tui2-opentui-source-code"
aliases:
  - km-tui1.18
  - km-tui1-18
  - "@km/tui1/18"
created_at: 2026-01-17T00:09:54Z
closed_at: 2026-01-17T00:14:37Z
---

# [x] Archive TUI2 (OpenTUI) source code @km/tui1 #task #P3

## Summary

Move TUI2 (OpenTUI) code to an archive location to reduce clutter while preserving it for future reference.

## Context

Per @km/tui-eval, TUI2 is deferred due to blocking OpenTUI bugs. The code should be archived rather than deleted in case OpenTUI matures and we want to revisit.

## Current Location

```
apps/km-tui/packages/km-opentui/
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── Card.tsx
│   │   ├── Header.tsx
│   │   ├── TreeNode.tsx
│   │   └── ...
│   ├── text/
│   │   ├── rich.tsx
│   │   └── index.ts
│   └── ...
├── package.json
└── tsconfig.json
```

## Proposed Archive Location

Option A: Move to archive folder
```
archive/km-opentui/  (at repo root)
```

Option B: Move to vendor folder
```
vendor/opentui/km-opentui/  (alongside issue docs)
```

## Tasks

- [ ] Choose archive location
- [ ] Move @km/_orphan/opentui package
- [ ] Remove from workspace (pnpm-workspace.yaml or similar)
- [ ] Update any imports/references
- [ ] Remove tui2 command from CLI if present
- [ ] Update CLAUDE.md if it references TUI2

## Acceptance Criteria

- [ ] TUI2 code moved out of active codebase
- [ ] Build/test still works without TUI2
- [ ] Code preserved for future reference
- [ ] No dangling imports or references

## References

- [ADR 001: TUI Architecture](docs/adr/001-tui-architecture.md)
- @km/tui-eval decision