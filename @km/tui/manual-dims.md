---
id: "@km/tui/manual-dims"
aliases:
  - km-tui.manual-dims
  - km-tui-manual-dims
created_by: claude:fcaad2fa
created_at: 2026-02-18T14:49:06Z
closed_at: 2026-02-19T16:17:17Z
owner: bjorn@stabell.org
assignee: claude:fcaad2fa
---

# [x] Remove manual dimension calculations — use inkx/flexx layout @km/tui #task #P2 @claude:fcaad2fa

## Goal
Remove manual dimension calculations across @km/tui in favor of automatic inkx/flexx layout. When inkx/flexx lacks needed features, fix them directly.

## Anti-Patterns to Eliminate

### A: Manual inner width/height calculation
```tsx
// BAD: manually subtracting border/padding
const innerWidth = Math.max(10, width - 6)
<Box width={innerWidth}>...</Box>

// GOOD: let flex layout handle it
<Box>...</Box>  // children auto-fill parent content area
```

### B: Manual text truncation
```tsx
// BAD: .slice() for truncation
const text = content.slice(0, width - 3)

// GOOD: inkx wrap=truncate
<Text wrap="truncate">{content}</Text>
```

### C: Manual centering with padding
```tsx
// BAD: compute padding to center text
const leftPad = Math.floor((width - text.length) / 2)
{' '.repeat(leftPad)}{text}{' '.repeat(rightPad)}

// GOOD: flex centering
<Box justifyContent="center"><Text>{text}</Text></Box>
```

### D: Manual separator/border drawing
```tsx
// BAD: repeat chars for HR
{'─'.repeat(innerWidth - 2)}

// GOOD: Box with borderBottom or dedicated <HR/> component
<Box borderBottom="single" />
```

### E: Manual Math.max guards
```tsx
// BAD: defensive guard against negative
Math.max(0, width - 2)
Math.max(10, width - 6)

// GOOD: inkx handles small/zero dimensions
<Box overflow="hidden">...</Box>
```

### F: width={N} on children inside flex parents
```tsx
// BAD: explicit width on flex children
<Box width={width}><Box width={innerWidth}>...</Box></Box>

// GOOD: flexGrow or omit width
<Box width={width}><Box flexGrow={1}>...</Box></Box>
```

### G: Manual height reserves for fixed elements
```tsx
// BAD: subtract header/footer heights
height={height - 3}

// GOOD: use flexGrow on the flexible area
<Box flexDirection="column" height={height}>
  <Box height={1} flexShrink={0}>header</Box>
  <Box flexGrow={1}>content</Box>
  <Box height={1} flexShrink={0}>footer</Box>
</Box>
```

### H: Manual column count calculation
```tsx
// MAY BE LEGITIMATE if inkx lacks auto-grid
Math.floor((width - 1) / (colWidth + 1))
// But check if inkx has flexWrap or similar
```

## Search Keywords
```
width - [0-9]   height - [0-9]   innerWidth   innerHeight
Math.max(       Math.min(        Math.floor(  Math.ceil(
.repeat(        .slice(0,        .padEnd(     .padStart(
width={         height={         width=\`
```

## Files with Manual Calcs
DetailPane.tsx, CardColumn.tsx, Board.tsx, ColumnsView.tsx, ListView.tsx, TabsView.tsx, HelpOverlay.tsx, FilterDialog.tsx, ConsoleModal.tsx, OverflowIndicator.tsx, render.ts, layout/path.ts