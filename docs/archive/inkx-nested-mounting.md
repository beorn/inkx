# InkX Nested Mounting — ARCHIVED 2026-04-17

> **Ink is retired**; km uses [silvery](../../vendor/silvery/). This speculative design won't ship.

# Nested Mounting API for Silvery

> **Status: Future** — Speculative design, no concrete use case yet.

Allow rendering into sub-regions of an existing Silvery app, similar to React's `createRoot(container)` pattern.

**TL;DR:** Extend `render()` to accept an AutoLocator as mount target, enabling multiple independent React trees in different terminal regions. Useful for micro-frontend patterns in CLI apps.

---

## Motivation

### Current State

Today, Silvery apps are single React trees:

```tsx
using term = createTerm()
await render(term, <App />)
```

All layout happens within `<App />` via flexbox composition.

### What This Would Enable

```tsx
// Render a layout shell first
const layout = await render(term, <Layout />)

// Then mount independent components into named regions
await render(layout.locator('#header'), <StatusBar />)
await render(layout.locator('#content'), <Board />)
await render(layout.locator('#footer'), <CommandPalette />)
```

### When This Might Be Useful

- **Micro-frontends** — Different teams own different regions
- **Plugin systems** — Third-party components in reserved regions
- **Lazy loading** — Mount regions on-demand
- **Independent update cycles** — Header updates without re-rendering content

---

## Proposed Design

### API Changes

```tsx
// render() accepts Term OR AutoLocator
function render(
  target: Term | AutoLocator,
  element: ReactElement,
  options?: RenderOptions
): Promise<App>

// AutoLocator provides bounding box for the mount region
interface AutoLocator {
  boundingBox(): { x: number, y: number, width: number, height: number } | null
}
```

### Layout Component Pattern

```tsx
function Layout() {
  return (
    <Box flexDirection="column" height="100%">
      <Box testID="header" height={3} />
      <Box testID="content" flexGrow={1} />
      <Box testID="footer" height={1} />
    </Box>
  )
}
```

The parent reserves space; children fill it.

### Multiple React Roots

Each `render()` call creates an independent React reconciler root:

```tsx
const layout = await render(term, <Layout />)
const header = await render(layout.locator('[testID="header"]'), <StatusBar />)
const content = await render(layout.locator('[testID="content"]'), <Board />)

// Each has independent state, context, update cycle
```

---

## Open Questions

### 1. Coordination Between Roots

How do independent React roots communicate?

**Options:**
- A: External state manager (zustand, jotai)
- B: Event bus pattern
- C: Shared context via custom provider

### 2. Update Ordering

When multiple roots update, what order do they paint?

**Options:**
- A: Parent-first (layout, then children)
- B: Last-updated-wins (simple, may flicker)
- C: Batched (collect all updates, single repaint)

### 3. AutoLocator as Mount Target

AutoLocators are designed for querying, not mounting. Is this the right abstraction?

**Alternatives:**
- Named slots: `<Slot name="header" />`
- Ref-based: `useRef()` + `render(ref, <Child />)`
- Portal-based: `createPortal(<Child />, region)`

### 4. Resize Handling

When terminal resizes, how do nested mounts re-layout?

**Options:**
- A: Each root handles resize independently
- B: Parent broadcasts new dimensions to children
- C: Single resize handler coordinates all roots

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Multiple reconcilers = complexity | High | Start with single use case |
| No shared React context | Medium | Document, provide alternatives |
| Performance overhead | Medium | Benchmark before committing |
| AutoLocator misuse | Low | Consider alternative API |

---

## Alternatives

### A. Standard React Composition (Recommended for Most Cases)

```tsx
<App>
  <StatusBar />
  <Board />
  <CommandPalette />
</App>
```

Single React tree, shared context, simple.

### B. React Portals

```tsx
function Layout() {
  const headerRef = useRef()
  return (
    <Box>
      <Box ref={headerRef} />
      {createPortal(<StatusBar />, headerRef.current)}
    </Box>
  )
}
```

Still single tree, but content renders elsewhere.

### C. Slot Pattern

```tsx
<Layout
  header={<StatusBar />}
  content={<Board />}
  footer={<CommandPalette />}
/>
```

Explicit composition via props.

---

## Use Case Assessment for km

**Current status:** No concrete use case in km.

km-tui is a single-tree app where all components share context (repo, layout, UI state). Nested mounting would add complexity without clear benefit.

**Potential future use:**
- If km adds plugin support with isolated rendering
- If different views need completely separate state trees

---

## Critique (2026-01-29)

### The DOM Analogy is Flawed

Terminals are character grids, not node trees. You can't "mount" into a region the way you mount into a DOM container. When a terminal "region" updates, the entire screen typically gets repainted. There's no persistent container element that holds child content.

### AutoLocator is Wrong Abstraction

AutoLocators are designed for *querying* the rendered output (testing), not for *defining* layout regions. Using them as mount targets mixes read and write concerns. A better abstraction might be named slots or refs.

### Multiple React Reconcilers = Complexity

The proposal suggests "each render creates independent React reconciler root." This means:
- Separate state trees (no shared context without manual wiring)
- Coordination problems (what happens when both want to update?)
- Performance overhead from multiple reconciler instances
- Loss of React's built-in composition benefits

### Verdict

**Not recommended for implementation** without a concrete use case that can't be solved with standard React composition. The generator-based render API ([inkx-render-api.md](inkx-render-api.md)) addresses more pressing pain points and should be prioritized.

---

## Implementation (If Needed)

### Phase 1: Proof of Concept

- Extend render() to accept AutoLocator
- Single nested mount (header only)
- Validate coordination approach

### Phase 2: Multi-Region

- Support arbitrary number of mounts
- Resize coordination
- Update batching

### Phase 3: Production Hardening

- Performance optimization
- Error boundaries per region
- DevTools support

---

## See Also

- [inkx-render-api.md](inkx-render-api.md) — Generator-based unified render API (higher priority)
- React 18 `createRoot()` — [React docs](https://react.dev/reference/react-dom/client/createRoot)
- Micro-frontends — [martinfowler.com](https://martinfowler.com/articles/micro-frontends.html)
