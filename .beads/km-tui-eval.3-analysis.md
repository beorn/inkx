# TUI1 Layout Abstraction Prototype Analysis

## Overview

This document explores 5 approaches for abstracting TUI1's layout boilerplate without implementing them. Each approach is evaluated for feasibility, complexity, and impact.

---

## Approach 1: LayoutContext + useLayout Hook

### Concept

A React context that provides layout dimensions and a hook to consume them.

### Proposed API

```typescript
// Context provider wraps the entire TUI
<LayoutProvider width={terminalWidth} height={terminalHeight}>
  <Board />
</LayoutProvider>

// Components use the hook
function TreeNode({ depth }) {
  const { width, registerWidth } = useLayout();

  // Calculate this component's width
  const indent = depth * 2;
  const myWidth = registerWidth('prefix', indent);
  const contentWidth = width - myWidth;

  return (
    <Box width={width}>
      <Text>{' '.repeat(indent)}</Text>
      <Text wrap="truncate">{content}</Text>
    </Box>
  );
}
```

### Implementation Sketch

```typescript
interface LayoutContext {
  width: number;
  height: number;
  allocations: Map<string, number>;
  registerWidth: (key: string, amount: number) => number;
  availableWidth: () => number;
}

const LayoutContext = createContext<LayoutContext | null>(null);

function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout requires LayoutProvider');
  return ctx;
}
```

### Assessment

| Criterion | Score | Notes |
|-----------|-------|-------|
| Reduces boilerplate | ⭐⭐⭐ | Moderate - still need calculations |
| Ease of adoption | ⭐⭐ | Requires wrapping app + updating all components |
| Performance | ⭐⭐⭐ | Context updates may cause excess re-renders |
| Debugging | ⭐⭐ | State in context harder to inspect |
| Flexibility | ⭐⭐⭐⭐ | Can handle complex layouts |

**Verdict**: Medium value - helps but doesn't eliminate the core problem.

---

## Approach 2: Constraint Components

### Concept

Higher-order components that handle width/truncation logic.

### Proposed API

```typescript
// TruncatedText - handles ANSI-aware truncation
<TruncatedText width={40} ellipsis="…" content={styledContent} />

// FlexRow - distributes width among children
<FlexRow width={80}>
  <FlexItem flex={1}><Prefix /></FlexItem>
  <FlexItem flex={3}><Content /></FlexItem>
  <FlexItem flex={1}><Suffix /></FlexItem>
</FlexRow>

// ConstrainedColumn - handles column width in multi-column layout
<ConstrainedColumns width={120} columns={4} gap={1}>
  {columns.map(col => <Column key={col.id} data={col} />)}
</ConstrainedColumns>
```

### Implementation Sketch

```typescript
interface TruncatedTextProps {
  content: string;  // May contain ANSI codes
  width: number;
  ellipsis?: string;
  pad?: boolean;
}

function TruncatedText({ content, width, ellipsis = '…', pad = false }: TruncatedTextProps) {
  const truncated = truncateText(content, width);
  const padded = pad ? padText(truncated, width) : truncated;
  return <Text>{padded}</Text>;
}

interface FlexRowProps {
  width: number;
  children: React.ReactElement<FlexItemProps>[];
}

function FlexRow({ width, children }: FlexRowProps) {
  const totalFlex = children.reduce((sum, c) => sum + (c.props.flex || 1), 0);
  return (
    <Box flexDirection="row" width={width}>
      {React.Children.map(children, child => {
        const flex = child.props.flex || 1;
        const itemWidth = Math.floor((width * flex) / totalFlex);
        return React.cloneElement(child, { width: itemWidth });
      })}
    </Box>
  );
}
```

### Assessment

| Criterion | Score | Notes |
|-----------|-------|-------|
| Reduces boilerplate | ⭐⭐⭐⭐ | Good - encapsulates common patterns |
| Ease of adoption | ⭐⭐⭐⭐ | Can adopt incrementally |
| Performance | ⭐⭐⭐⭐ | Minimal overhead |
| Debugging | ⭐⭐⭐⭐ | Components are inspectable |
| Flexibility | ⭐⭐⭐ | May need variants for edge cases |

**Verdict**: High value - best balance of abstraction and control.

---

## Approach 3: Declarative Layout DSL

### Concept

A layout specification language that compiles to Ink components.

### Proposed API

```typescript
const layout = createLayout({
  type: 'row',
  width: 120,
  children: [
    { type: 'column', width: 30, children: [...] },
    { type: 'separator', width: 1 },
    { type: 'column', flex: 1, children: [...] },
  ]
});

return <Layout spec={layout} data={state} />;
```

### Implementation Sketch

```typescript
interface LayoutSpec {
  type: 'row' | 'column' | 'text' | 'separator';
  width?: number;
  flex?: number;
  children?: LayoutSpec[];
  render?: (width: number, data: any) => React.ReactNode;
}

function Layout({ spec, width, data }: { spec: LayoutSpec; width: number; data: any }) {
  // Resolve widths
  const resolvedSpec = resolveWidths(spec, width);
  // Render tree
  return renderSpec(resolvedSpec, data);
}
```

### Assessment

| Criterion | Score | Notes |
|-----------|-------|-------|
| Reduces boilerplate | ⭐⭐⭐⭐⭐ | Excellent - declarative |
| Ease of adoption | ⭐ | Requires rewriting all layouts |
| Performance | ⭐⭐⭐ | Compilation overhead |
| Debugging | ⭐⭐ | Spec → component mapping unclear |
| Flexibility | ⭐⭐ | DSL may not cover all cases |

**Verdict**: Over-engineered for the problem size.

---

## Approach 4: Width Prop Auto-Injection

### Concept

Babel/TypeScript transform that auto-injects width props.

### Proposed API

```typescript
// Developer writes:
function TreeNode({ node }) {
  return (
    <Box>
      <Text>{content}</Text>
    </Box>
  );
}

// Transform produces:
function TreeNode({ node, __width }) {
  return (
    <Box width={__width}>
      <Text wrap="truncate">{content}</Text>
    </Box>
  );
}
```

### Assessment

| Criterion | Score | Notes |
|-----------|-------|-------|
| Reduces boilerplate | ⭐⭐⭐⭐⭐ | Excellent - invisible to developer |
| Ease of adoption | ⭐ | Requires build tooling; magic behavior |
| Performance | ⭐⭐⭐⭐ | Compile-time; no runtime cost |
| Debugging | ⭐ | Hard to understand transformed code |
| Flexibility | ⭐⭐ | Limited to what transform can detect |

**Verdict**: Too magical - debugging would be nightmare.

---

## Approach 5: Ink Plugin/Middleware

### Concept

Hook into Ink's rendering pipeline to inject width information.

### Proposed API

```typescript
// Configure Ink with layout middleware
const { render } = createInkWithLayout({
  autoWidth: true,
  truncateText: true,
});

render(<Board />);

// Components automatically get layout-aware behavior
function TreeNode() {
  return (
    <Box>
      <Text>{content}</Text>  {/* Auto-truncated to available width */}
    </Box>
  );
}
```

### Assessment

| Criterion | Score | Notes |
|-----------|-------|-------|
| Reduces boilerplate | ⭐⭐⭐⭐⭐ | Excellent - automatic |
| Ease of adoption | ⭐⭐ | Requires Ink internals knowledge |
| Performance | ⭐⭐⭐ | Middleware overhead |
| Debugging | ⭐ | Hidden behavior; hard to trace |
| Flexibility | ⭐⭐⭐ | Limited by what middleware can intercept |

**Verdict**: Not feasible - Ink doesn't expose this extension point.

---

## Comparison Matrix

| Approach | Boilerplate | Adoption | Performance | Debugging | Flexibility | Overall |
|----------|-------------|----------|-------------|-----------|-------------|---------|
| 1. LayoutContext | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | 14/25 |
| 2. Constraint Components | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 19/25 |
| 3. Layout DSL | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | 13/25 |
| 4. Auto-Injection | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐ | ⭐ | ⭐⭐ | 13/25 |
| 5. Ink Plugin | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ | 14/25 |

## Recommended Approach: Constraint Components

### Why Constraint Components Win

1. **Incremental adoption** - Can add components one at a time
2. **Clear mental model** - Just React components
3. **Easy to debug** - Standard component tree
4. **Covers 80% of cases** - TruncatedText, FlexRow, ScrollableList
5. **Reasonable effort** - 2-3 days for core components

### Proposed Component Set

| Component | Purpose | Priority |
|-----------|---------|----------|
| `TruncatedText` | ANSI-aware text truncation | High |
| `FlexRow` | Distribute width among children | High |
| `ScrollableList` | Virtualized scrolling with indicators | Medium |
| `ConstrainedColumn` | Column in multi-column layout | Medium |
| `WidthProvider` | Context for passing dimensions | Low |

### Example Refactor (TreeNode)

**Before** (current code):
```typescript
function TreeNode({ node, width, ... }) {
  const prefixLength = indent.length + foldIndicator.length + iconChar.length + 2;
  const wrapWidth = Math.max(1, width - prefixLength);
  const { lines } = constrainText(styledContent, wrapWidth, maxContentLines);
  // ... lots of calculation code
}
```

**After** (with Constraint Components):
```typescript
function TreeNode({ node, width, ... }) {
  return (
    <FlexRow width={width}>
      <FlexItem width={indent.length}>{indent}</FlexItem>
      <FlexItem width={1}>{foldIndicator}</FlexItem>
      <FlexItem width={iconChar.length}>{icon}</FlexItem>
      <FlexItem flex={1}>
        <TruncatedText content={styledContent} ellipsis="…" />
      </FlexItem>
    </FlexRow>
  );
}
```

**Lines reduced**: ~50 → ~15 per component

## Conclusion

**Recommendation**: Implement Constraint Components (Approach 2)

- Provides meaningful improvement (~60% less boilerplate)
- Low risk (just React components)
- Can be done incrementally
- Estimated effort: 2-3 days

This approach addresses the layout pain points without over-engineering the solution.
