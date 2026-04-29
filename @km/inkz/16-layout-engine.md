---
id: "@km/inkz/16-layout-engine"
aliases:
  - km-inkz.16-layout-engine
  - km-inkz-16-layout-engine
created_at: 2026-01-19T12:02:52Z
closed_at: 2026-01-19T15:04:19Z
---

# [x] InkZ: Pluggable layout engine (Yoga/Taffy) @km/inkz #task #P4

## Goal

Make the layout engine pluggable so InkZ can use either Yoga or Taffy.

## Motivation

- **Yoga** (Facebook): Battle-tested, used by React Native and Ink. Good default.
- **Taffy** (Dioxus): More complete flexbox implementation, better maintained, Rust/WASM.

## Design

Abstract the layout engine behind an interface:

```typescript
interface LayoutEngine {
  createNode(): LayoutNode;
  setFlexDirection(node: LayoutNode, direction: 'row' | 'column'): void;
  // ... other flexbox properties
  calculateLayout(root: LayoutNode, width: number, height: number): void;
  getComputedLayout(node: LayoutNode): { x: number; y: number; width: number; height: number };
}
```

## Implementation

1. Define LayoutEngine interface
2. Implement YogaLayoutEngine (default)
3. Implement TaffyLayoutEngine (optional, WASM)
4. Allow engine selection at render time

## Priority

P4 (backlog) - Yoga is sufficient for MVP.
