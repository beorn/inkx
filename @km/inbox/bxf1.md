---
id: "@km/inbox/bxf1"
aliases:
  - km-bxf1
  - "@km/_orphan/bxf1"
created_at: 2026-01-16T10:48:53Z
closed_at: 2026-01-16T11:29:07Z
---

# [x] Align terminology with km-board-navigation.md spec @km/_orphan #task #P3

Systematically review all docs, code, and tests to ensure terminology matches the Visual Board Navigation Model spec.

## Background
The @km/board-navigation/md spec defines specific terminology:
- **cursor-select (cursoring)**: h j k l / arrows - moving cursor in visual direction
- **extend-select**: shift+hjkl - extending selection
- **navigating**: u / Enter / [ / ] - changing board root (zoom)
- **shifting**: opt+hjkl - moving selected node(s) in visual direction
- **moving**: m + destination - moving nodes from anywhere to anywhere

Additionally:
- **node-selection mode** vs **text-selection mode**
- **full-width blocks** as navigation targets
- **title y-center** for cross-column card matching

## Scope

### 1. Code Review
Files to check:
- packages/@km/_orphan/tui-core/src/types.ts - Action type names and comments
- packages/@km/_orphan/tui-core/src/treeReducer.ts - Function names and comments
- packages/@km/_orphan/tui-core/src/commandParser.ts - Command names
- packages/@km/_orphan/tui-core/src/shellExecutor.ts - Key mapping comments
- apps/@km/_orphan/cli/src/commands/sh.ts - Help text and comments
- apps/@km/_orphan/cli/src/App.tsx - Key handler comments

Terms to verify/update:
- 'cursoring' not 'cursor movement'
- 'cursor-select' not just 'select'
- 'navigating' specifically means zoom/root change
- 'shifting' not 'moving' for visual direction movement
- 'moving' reserved for arbitrary relocation

### 2. Test Review
- apps/@km/_orphan/cli/tests/sh/keys.test.md - Section names and descriptions
- packages/@km/_orphan/tui-core/tests/treeReducer.test.ts - Test names and comments

### 3. Documentation Review
- specs/@km/board-navigation/md - Primary source (should be correct)
- specs/README.md - Update if references navigation
- CLAUDE.md - Update if references navigation terms

## Deliverables
- [ ] Create list of all terminology mismatches found
- [ ] Update code comments to use consistent terminology
- [ ] Update test descriptions to use consistent terminology
- [ ] Update any other specs/docs that reference navigation

## Verification
- grep/search for inconsistent terms like:
  - 'cursor movement' (should be 'cursoring' or 'cursor-select')
  - 'move up/down' for navigation (should be 'cursor up/down' or 'cursor-select')
  - 'selection' without qualifying which type
  - 'navigate' used for cursor movement (should only mean zoom/root change)