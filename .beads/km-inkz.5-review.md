# InkZ: Expert Review & Iterations

## Part 1: Product Manager / Vibe Coding Orchestrator Review

### What's Good

1. **Clear problem statement** - The "147 lines of constraint-threading code" is a compelling concrete metric
2. **Compatibility-first approach** - Using Ink/Chalk test suites as the spec is smart
3. **Phased implementation** - Clear milestones with measurable targets
4. **Test-driven** - Phase 0 for test infrastructure before code is the right call

### Critical Gaps Identified

#### Gap 1: No "Hello World to Production" Path

The plan jumps from "PoC that proves useLayout() works" to "5 weeks of implementation." Where's the **minimum lovable product**?

**Recommendation**: Define a concrete "Week 1 Demo" that a developer could actually try:

```bash
# Week 1: Developer can do this
npx create-inkz-app my-app
cd my-app
bun run dev
# See a working TUI with useLayout() actually working
```

#### Gap 2: No Migration Story for Existing Ink Apps

The docs say "drop-in replacement" but don't address:
- What breaks? (There will be edge cases)
- How do users discover breakage?
- Is there a codemod?

**Recommendation**: Add a migration guide with known incompatibilities and workarounds.

#### Gap 3: No Community/Adoption Strategy

Building for "km first, open source later" is fine, but:
- Who's the target user beyond km?
- Why would they switch from Ink?
- What's the "10x better" pitch?

**Recommendation**: Define the "golden demo" - one example that makes people say "I NEED this."

#### Gap 4: Testing Strategy Assumes Success

The test plan is comprehensive but doesn't address:
- What if Ink's tests rely on internal APIs we can't replicate?
- What if some tests are fundamentally incompatible with two-phase render?
- What's the "good enough" threshold?

**Recommendation**: Triage Ink's 31 test files into "must pass", "should pass", "won't pass" categories upfront.

---

## Part 2: System Architect Review - Iteration 1

### Architecture Concerns

#### Concern 1: The Two-Phase Render is Actually Three Phases

The design says:
1. Measure (React reconciliation)
2. Layout (Yoga)
3. Render (content with dimensions)

But React's reconciler doesn't work this way. The reconciler calls your `createInstance` and `appendChild` during reconciliation, but `commitMount` happens AFTER the commit phase. You can't "re-render" in `commitMount` - you'd need a second reconciliation pass.

**The Real Flow Would Be:**
```
Phase 1: React reconciliation → creates InkZNodes with Yoga nodes
Phase 2: prepareForCommit → Yoga.calculateLayout()
Phase 3: commitMount → render content to buffer (but children already committed!)
```

**Problem**: By the time `commitMount` fires, children have already committed. You can't change what they rendered.

**Solution Options:**

A. **Deferred content rendering**: Components don't render content in React - they register a render callback. After layout, traverse the tree and call all callbacks.

B. **Double reconciliation**: Reconcile once to build layout tree, calculate, then reconcile AGAIN with a context providing dimensions. Expensive but cleaner.

C. **Immediate mode hybrid**: Don't use React for the render phase at all. React builds the layout tree, then we imperatively render content.

**Recommendation**: Option A (deferred callbacks) is closest to the current design. But the docs need to be explicit about this - components return `null` from their React render and register a callback.

#### Concern 2: useLayout() Can't Work As Described

```typescript
function Header() {
  const { width } = useLayout();  // THIS IS THE TEST
  return <Text>{'='.repeat(width)}</Text>;
}
```

This implies `useLayout()` returns dimensions during React's render phase. But dimensions aren't computed until AFTER render. This is the same chicken-and-egg problem Ink has!

**The Hook Must Work Differently:**

```typescript
function Header() {
  // Option A: Force re-render after layout
  const { width } = useLayout(); // Returns undefined on first render
  if (width === undefined) return null; // Or placeholder
  return <Text>{'='.repeat(width)}</Text>;

  // Option B: Render callback pattern
  return <Box render={({ width }) => <Text>{'='.repeat(width)}</Text>} />;

  // Option C: Suspend until layout (experimental)
  const { width } = useLayoutSync(); // Throws promise, resumes after layout
  return <Text>{'='.repeat(width)}</Text>;
}
```

**Recommendation**: Be explicit that `useLayout()` triggers a re-render. The "magic" is that it DOES trigger a re-render with correct dimensions, unlike Ink's `measureElement()` which requires manual re-render.

#### Concern 3: No Incremental Layout Strategy

The design shows a clean 4-phase pipeline, but real apps have:
- Frequent small updates (cursor blink, spinner)
- Occasional layout changes (window resize, content change)

If every state change triggers full layout recalculation, performance will suffer.

**Recommendation**: Add dirty tracking:
```typescript
interface InkZNode {
  layoutDirty: boolean;  // Needs re-layout
  contentDirty: boolean; // Needs re-render but layout unchanged
}
```

---

## Part 3: System Architect Review - Iteration 2

### Deeper Architecture Analysis

#### Concern 4: Cell Buffer Approach Has Hidden Complexity

The design proposes:
```typescript
interface Cell {
  char: string;
  fg: Color | null;
  bg: Color | null;
  attrs: Set<Attr>;
}
type TerminalBuffer = Cell[][];
```

**Problems:**

1. **Wide characters**: CJK characters are 2 cells wide but 1 character. How do you handle `中` taking cells [0] and [1]?

2. **Combining characters**: `é` can be `e` + `́` (combining acute). Is that 1 cell or 2?

3. **ANSI preservation**: Chalk produces `\x1b[31mfoo\x1b[0m`. If we decompose to cells then recompose, do we produce the same ANSI? What about nested styles?

4. **Memory**: 80x24 = 1920 cells. Each Cell object has overhead. With 60fps updates, GC pressure matters.

**Recommendations:**

1. Use `grapheme-splitter` or similar for proper Unicode handling
2. Store "continuation" marker for wide chars: `{ char: '中', wide: true }` followed by `{ continuation: true }`
3. For ANSI compat, consider string-based diffing as an alternative (diff ANSI strings, not cells)
4. Use typed arrays or object pools for cells to reduce GC

#### Concern 5: Yoga Integration Assumptions

The design assumes Yoga exposes what we need. Let's verify:

```typescript
// Yoga's actual API (yoga-layout 2.0)
const node = Yoga.Node.create();
node.setWidth(100);
node.setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
node.calculateLayout(Yoga.UNDEFINED, Yoga.UNDEFINED, Yoga.DIRECTION_LTR);

// After layout:
node.getComputedWidth();   // ✓ Available
node.getComputedHeight();  // ✓ Available
node.getComputedLeft();    // ✓ Available
node.getComputedTop();     // ✓ Available
```

**Good news**: Yoga DOES expose computed layout. The design's assumption is correct.

**Concern**: Yoga doesn't support `fit-content` (shrink to content). For text that should size to its content, we'd need to:
1. Measure text width
2. Set Yoga node's width to that measurement
3. Then calculate layout

This is a **pre-layout measurement pass** - so we actually have FOUR phases:
1. React reconciliation
2. Content measurement (for fit-content nodes)
3. Yoga layout
4. Content rendering

#### Concern 6: React Reconciler Version Compatibility

The design uses `react-reconciler` but doesn't specify which React version. React 18+ has significant reconciler changes (concurrent features, transitions, suspense).

**Questions:**
- Do we support React 18 concurrent features?
- What about `useSyncExternalStore` for layout state?
- Does Suspense work with our two-phase render?

**Recommendation**: Start with React 18 sync mode only. Add concurrent support later.

---

## Part 4: System Architect Review - Iteration 3

### Final Architecture Recommendations

#### Recommendation 1: Revised Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase 0: RECONCILIATION                                                     │
│                                                                              │
│  React reconciliation builds component tree                                  │
│  Components return LayoutSpec OR ContentCallback                             │
│  Output: Tree of InkZNodes with Yoga nodes attached                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase 1: MEASURE (optional, for fit-content)                                │
│                                                                              │
│  Traverse nodes with width="fit-content"                                     │
│  Call measureContent() to get intrinsic size                                 │
│  Set Yoga constraints based on measurement                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase 2: LAYOUT                                                             │
│                                                                              │
│  yoga.calculateLayout(rootWidth, rootHeight)                                 │
│  Propagate computed dimensions to all nodes                                  │
│  Mark useLayout() subscribers for re-render                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase 3: CONTENT RENDER                                                     │
│                                                                              │
│  For each node with contentCallback:                                         │
│    - Provide computed dimensions via LayoutContext                           │
│    - Execute callback to get terminal content                                │
│  Build character buffer                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Phase 4: DIFF & OUTPUT                                                      │
│                                                                              │
│  Compare buffer against previous frame                                       │
│  Emit minimal ANSI sequences                                                 │
│  Update cursor position                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Recommendation 2: Clearer useLayout() Semantics

```typescript
// InkZ's useLayout() contract:
// 1. Returns { width: 0, height: 0 } on first render (before layout)
// 2. Automatically triggers re-render after layout phase completes
// 3. Returns actual dimensions on second render
// 4. Does NOT re-render if dimensions unchanged

function useLayout(): ComputedLayout {
  const node = useInkZNode();
  const [, forceUpdate] = useReducer(x => x + 1, 0);

  useLayoutEffect(() => {
    // Subscribe to layout completion
    const unsubscribe = node.onLayoutComplete(() => {
      if (dimensionsChanged(node)) {
        forceUpdate();
      }
    });
    return unsubscribe;
  }, [node]);

  return node.computedLayout ?? { width: 0, height: 0, x: 0, y: 0 };
}
```

#### Recommendation 3: Performance Optimization Paths

Add to design doc:

**Optimization 1: Layout Caching**
- Cache Yoga tree structure
- Only recalculate on structural changes
- Prop-only changes reuse cached layout if dimensions unchanged

**Optimization 2: Dirty Rectangles**
- Track which regions of the buffer changed
- Only diff/output changed regions
- Especially important for cursor movement, selection changes

**Optimization 3: Frame Coalescing**
- Multiple rapid state changes → single render
- Use `requestAnimationFrame` equivalent for terminal
- Cap at 60fps max (terminal can't display faster anyway)

#### Recommendation 4: Compatibility Tiers

Revise the compatibility strategy with explicit tiers:

**Tier 1 - Must Work (blocks MVP)**
- `<Box>` with all flexbox props
- `<Text>` with color, background, bold, italic, underline
- `render()` with stdout/stdin options
- `useInput()` for keyboard
- `useApp()` for exit

**Tier 2 - Should Work (blocks 1.0)**
- `<Spacer>`, `<Newline>`
- `<Static>` for persistent output
- `useFocus()`, `useFocusManager()`
- Border styles
- `measureElement()` (for compat, even though useLayout is better)

**Tier 3 - Nice to Have (post 1.0)**
- `<Transform>` for output transformation
- Screen reader support
- Full focus management parity

**Tier 4 - Explicitly Not Supported**
- Ink's internal APIs
- Undocumented behaviors
- Bugs that apps depend on

#### Recommendation 5: Risk Mitigation Additions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Two-phase render causes visual flicker | Medium | High | Ensure first render shows placeholder, not blank. Add loading state support. |
| Yoga WASM bundle too large | Low | Medium | yoga-wasm-web is 200KB. Could lazy-load or use yoga-layout (ASM.js fallback). |
| React 19 breaks reconciler | Medium | High | Pin to React 18. Add integration tests for React versions. |
| Memory leaks from callback registration | Medium | Medium | Use WeakMap for node→callback mapping. Test with long-running apps. |
| Unicode edge cases in cell buffer | High | Low | Use established library (graphemer). Comprehensive Unicode test suite. |

---

## Summary of Changes Needed

### Design Doc (km-inkz.3-design.md)

1. **Revise architecture diagram** to show 5 phases (add MEASURE phase)
2. **Clarify useLayout() semantics** - it triggers re-render, not magic
3. **Add dirty tracking** to performance section
4. **Add Unicode handling** to cell buffer section
5. **Specify React version** requirements

### Testing Doc (km-inkz.4-testing.md)

1. **Triage Ink tests** into must/should/won't pass tiers
2. **Add Unicode test fixtures** (CJK, emoji, combining chars)
3. **Add memory leak tests** for long-running apps
4. **Add flicker tests** to catch visual regressions

### Implementation Plan

1. **Add "Week 1 Demo" milestone** with concrete deliverable
2. **Add migration guide task** to Phase 3
3. **Add codemod exploration** to nice-to-have

### New Docs Needed

1. **km-inkz.6-migration.md** - Guide for migrating from Ink
2. **km-inkz.7-internals.md** - How the reconciler actually works (for contributors)
