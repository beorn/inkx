---
id: "@km/tui1/15-add-loading-state-to-fullscreen-ink-startup"
aliases:
  - km-tui1.15
  - km-tui1-15
  - "@km/tui1/15"
created_at: 2026-01-17T00:07:16Z
closed_at: 2026-01-17T00:30:20Z
---

# [x] Add loading state to fullscreen-ink startup @km/tui1 #task #P2

## Summary

Show a loading indicator during the fullscreen-ink alternate buffer race condition delay.

## Context

Per @km/tui-eval/1-analyze-tui1-layout-pain-points, pain point 5 (fullscreen-ink race) has an acceptable workaround but UX could improve.

## Current Behavior

```typescript
// Board.tsx - renders empty box during startup delay
if (!isReady) {
  return <Box />;
}
```

User sees: blank screen for 50-100ms

## Proposed Change

```typescript
if (!isReady) {
  return (
    <Box justifyContent="center" alignItems="center" height="100%">
      <Text color="gray">Loading...</Text>
    </Box>
  );
}
```

User sees: "Loading..." centered on screen

## Alternatives Considered

1. **Spinner animation** - May flicker during short delay
2. **Progress dots** - Adds complexity for marginal gain
3. **Keep blank** - Current behavior, fine but could be better

## Acceptance Criteria

- [ ] Show loading message during startup delay
- [ ] Message disappears when TUI is ready
- [ ] No flicker or visual artifacts
- [ ] Test manually on slow startup

## References

- [@km/tui-eval/1-analysis/md](.beads/@km/tui-eval/1-analysis/md) - Pain Point 5
- Current workaround: Board.tsx lines 531-584