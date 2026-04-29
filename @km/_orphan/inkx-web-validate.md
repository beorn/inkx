---
id: "@km/_orphan/inkx-web-validate"
aliases:
  - km-inkx-web-validate
created_at: 2026-02-02T14:21:41Z
closed_at: 2026-02-02T14:34:24Z
---

# [x] inkx-web-adapters: Complete web adapter validation (Canvas + DOM) @km/_orphan #task #P2 @claude:5fa2decc

Validate the inkx multi-adapter architecture with end-to-end tests.

## Background
Canvas and DOM adapters are implemented but need validation:
- RenderAdapter interface ✅
- Terminal/Canvas/DOM adapters ✅
- Browser demos (vanilla JS) ✅

## Remaining Work

### 1. End-to-End React Component Test
- [ ] Test renderToCanvas(<App />) with real React component
- [ ] Verify useContentRect() returns pixel dimensions
- [ ] Test state updates trigger re-renders

### 2. Integration Test Suite
- [ ] Create tests/canvas-e2e.test.tsx with React components
- [ ] Create tests/dom-e2e.test.tsx with React components
- [ ] Verify all text styles render correctly

### 3. Performance Baseline (Optional)
- [ ] Simple benchmark: Canvas vs DOM render times
- [ ] Document findings in roadmap.md

## Success Criteria
- useContentRect() returns pixel values in canvas/DOM mode
- React components render and update correctly
- Tests pass in CI (or skip gracefully without browser)