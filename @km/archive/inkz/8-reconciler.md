---
mentions:
  - km
id: "@km/inkz/8-reconciler"
aliases:
  - km-inkz.8-reconciler
  - km-inkz-8-reconciler
created_at: 2026-01-19T12:01:46Z
closed_at: 2026-01-19T14:35:52Z
---

# [x] InkZ: Complete reconciler and scheduler implementation @km/inkz #task #P1

## Goal

The InkZ reconciler and scheduler need to be fully functional for examples to work.

## Current Status

The render pipeline has these components:

- `render.tsx` - Entry point, initializes Yoga, creates container
- `reconciler.ts` - React reconciler that builds InkZ node tree
- `scheduler.ts` - Batches renders and outputs to terminal
- `pipeline.ts` - Converts node tree to terminal output
- `buffer.ts` - Cell-based terminal buffer
- `output.ts` - ANSI escape sequences

## Issues Identified (from visual inspection)

### 1. Text Content Not Rendering (CONFIRMED)

Visual inspection shows boxes render with borders but text content is empty.

**Root cause analysis:**

- When `<Text>Hello</Text>` is rendered:
  1. `createInstance('inkz-text', props)` is called for the Text element
  1. `createTextInstance("Hello")` is called for the raw text child
  1. The raw text node gets `textContent = "Hello"`
  1. But the **parent inkz-text node** has no textContent
- In `pipeline.ts` `renderText()` (line 291-311):
  - Uses `node.textContent` which is empty on inkz-text nodes
  - The actual text is in a child node

**Fix needed:**

- Option A: In pipeline, traverse text node children and concatenate textContent
- Option B: In reconciler, when inkz-text has text children, set textContent on parent

### 2. Dashboard Hang

Need to debug with logging - likely in async Yoga initialization or render loop.

### 3. useInput Raw Mode Error

The useInput hook (line 330) calls setRawMode unconditionally, crashing without TTY.

## Debug Checklist

- [x] Visual inspection confirms borders work, text empty
- [ ] Add logging to trace text node creation
- [ ] Verify textContent flows from child to parent or pipeline handles children
- [ ] Add TTY guard to useInput
- [ ] Debug dashboard hang point

## Acceptance Criteria

- [ ] Text content renders (not just borders)
- [ ] useInput works with TTY, degrades gracefully without
- [ ] Dashboard doesn't hang
- [ ] Examples display correctly

