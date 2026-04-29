---
id: "@km/tui1/2-complete-render-layering-refactor"
aliases:
  - km-tui1.2
  - km-tui1-2
  - "@km/tui1/2"
created_at: 2026-01-16T23:45:56Z
closed_at: 2026-01-17T00:42:46Z
---

# [x] Complete render layering refactor @km/tui1 #task #P2

Complete the render layering refactor started in @km/_orphan/96la.

**Cross-reference**: This tracks completion of @km/_orphan/96la.

## Remaining Tasks from @km/_orphan/96la

From the @km/_orphan/96la description, remaining work:
- [ ] Update render.ts (static chalk rendering) to use renderRich
- [ ] Add tests for ANSI-aware wrapping
- [ ] Document architecture in render-text.ts header

## Already Completed (in @km/_orphan/96la)

- [x] Add displayLength() using strip-ansi pattern
- [x] Create renderRich() using chalk for styling
- [x] Update wrapText() to use displayLength
- [x] Add truncateText() for single-line truncation
- [x] Remove legacy aliases
- [x] Delete renderStyled() (React node version)
- [x] Update TreeNode to use new flow
- [x] Delete OutlineItem from Board.tsx
- [x] Update DetailPane to use shared wrapText

## Files

- apps/@km/tui/packages/@km/_orphan/ink/src/text/rich.ts
- apps/@km/tui/packages/@km/_orphan/ink/src/render.ts