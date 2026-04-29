---
id: "@km/silvery/component-imports"
aliases:
  - km-silvery.component-imports
  - km-silvery-component-imports
created_by: claude:4929065a
created_at: 2026-04-01T21:17:03Z
---

# [ ] Docs show wrong import paths for components (ag-term instead of silvery) @km/silvery #bug #P2

Two-tier import model for silvery packages.

## Decision (confirmed with GPT 5.4 Pro review)

### Tier 1: Most users — silvery barrel
```typescript
import { SelectList, Box, Text, render } from "silvery"
```
One package, everything re-exported. This is the default in all docs and examples.

### Tier 2: Library authors / power users — @silvery/* scope
```typescript
import { selectListUpdate } from "@silvery/headless"
import { SelectList } from "@silvery/ag-react"
import { createTerm } from "@silvery/ag-term"
import { AgNode } from "@silvery/ag"
```
Granular packages for composability. Each is public and independently installable.

### Package roles
- @silvery/headless — pure (state, action) → state machines, zero deps
- @silvery/ag — core types, abstract nodes (no React)
- @silvery/ag-react — React reconciler + React components + hooks
- @silvery/ag-term — terminal runtime, ANSI output, pipeline
- @silvery/theme, @silvery/ansi, @silvery/commander, etc. — standalone utilities
- silvery — barrel re-exports everything (= the React framework)

### Fixes needed
1. Make @silvery/ag, ag-react, ag-term public (remove "private": true)
2. Fix all docs to show silvery barrel as primary import
3. Add "Power users" section to docs showing @silvery/* direct imports
4. Update silvery-internal design docs with this two-tier model
5. Fix reference/components.md showing @silvery/ag-term (wrong — should be silvery)