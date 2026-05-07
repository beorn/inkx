---
mentions:
  - km
id: "@km/tui1/14-replace-displaylength-with-string-width-package"
aliases:
  - km-tui1.14
  - km-tui1-14
  - "@km/tui1/14"
created_at: 2026-01-17T00:07:06Z
closed_at: 2026-01-17T00:29:33Z
---

# [x] Replace displayLength with string-width package @km/tui1 #task #P2

## Summary

Replace custom `displayLength()` function with the `string-width` npm package.

## Context

Per @km/tui-eval/1-analyze-tui1-layout-pain-points, pain point 3 (displayLength complexity) can be addressed by using a battle-tested package.

## Current Implementation

```typescript
// apps/km-tui/packages/km-ink/src/text/rich.ts
export const ANSI_REGEX = /\x1b\[[0-9;:]*m|\x1b\]8;;[^\x1b]*\x1b\\/g;

export function displayLength(text: string): number {
  return text.replace(ANSI_REGEX, "").length;
}
```

## Proposed Change

```typescript
import stringWidth from 'string-width';

export function displayLength(text: string): number {
  return stringWidth(text);
}
```

## Benefits

- Handles Unicode width (CJK characters = 2 cells)
- Handles emoji width
- Battle-tested, widely used
- Maintained by sindresorhus

## Acceptance Criteria

- [ ] Add string-width to dependencies
- [ ] Replace displayLength implementation
- [ ] Verify all existing tests pass
- [ ] Test with CJK characters and emoji
- [ ] No regressions in truncation behavior

## Notes

- Keep ANSI_REGEX export if used elsewhere
- May need to check version compatibility with Bun

## References

- [@km/tui-eval/1-analysis/md](.beads/@km/tui-eval/1-analysis/md) - Pain Point 3
- https://github.com/sindresorhus/string-width

