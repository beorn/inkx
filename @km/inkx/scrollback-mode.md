---
id: "@km/inkx/scrollback-mode"
aliases:
  - km-inkx.scrollback-mode
  - km-inkx-scrollback-mode
created_at: 2026-02-05T10:21:45Z
closed_at: 2026-02-09T12:50:07Z
assignee: claude:a3625ec3
---

# [x] feat(inkx): Scrollback mode for ergonomic CLI output @km/inkx #feature #P4 @claude:a3625ec3

# Scrollback Mode for inkx

Ergonomic pi-tui-like experience where historical output accumulates in terminal scrollback while active UI updates in place.

## Problem Statement

Current inkx modes:
- **Fullscreen**: Alternate screen buffer, NO scrollback
- **Inline**: Normal screen buffer, scrollback EXISTS but unused

Neither provides the pi-tui pattern where users can scroll up to review history with native terminal features.

## Key Insight: No New Mode Needed

Terminal buffer model:
- **Normal screen** (inline mode) → HAS scrollback
- **Alternate screen** (fullscreen mode) → NO scrollback

Apps in inline mode can ALREADY leverage scrollback. We just need a **Freeze API** to mark content as frozen/permanent.

## Research Summary

| Framework | Approach | Scrollback |
|-----------|----------|------------|
| pi-tui | Retained-mode, line-by-line | Native terminal (gold standard) |
| Textual | Inline mode | Above viewport |
| Rich | Live + console separation | Via live.console |
| Ink/inkx | Alternate screen | None |

### Technical Findings

- **CSI 2026** (synchronized output) prevents flicker - all modern terminals support
- **DECSTBM scroll regions** buggy in Kitty/iTerm2 - avoid
- **ESC[2J]** clears visible screen only (preserves scrollback)
- **ESC[3J]** clears entire scrollback buffer (destructive)
- **Ink's `<Static>`** is NOT terminal scrollback - it's render-once but still in alternate screen

## API Options Explored

### Option 1: Separate FrozenList Component

```tsx
<FrozenList
  items={results}
  renderItem={(result, index) => (
    <Text color={result.passed ? "green" : "red"}>
      {result.passed ? "✓" : "✗"} {result.name}
    </Text>
  )}
/>
```

Pros: Clear separation of concerns
Cons: Another component to learn, diverges from VirtualList

### Option 2: VirtualList with `freeze` prop (PREFERRED)

Key insight: Both VirtualList and freeze handle items that don't fit on screen:
- VirtualList: overflow **downward** → virtualize with placeholders
- Freeze: overflow **upward** → push to terminal scrollback

```tsx
// Normal virtualization (current)
<VirtualList
  items={cards}
  height={20}
  overflow="scroll"  // default
  renderItem={...}
/>

// Freeze mode (new)
<VirtualList
  items={results}
  height={5}         // active region size
  overflow="freeze"  // or just `freeze` prop
  renderItem={...}
/>
```

| Aspect | `overflow="scroll"` | `overflow="freeze"` |
|--------|---------------------|---------------------|
| Items above viewport | Placeholder box | In terminal scrollback |
| Items below viewport | Placeholder box | In React tree (pending) |
| Memory | Only visible items | Only unfrozen items |
| User scroll | Via `scrollTo` prop | Native terminal scroll |

### Option 3: useFreeze() Hook (Imperative)

For high-frequency streaming that bypasses React reconciliation:

```tsx
const { freeze, count } = useFreeze()

useEffect(() => {
  stream.onLine((line) => {
    freeze(<Text>{line}</Text>)  // Fire-and-forget
  })
}, [])
```

## Height Options

For freeze mode, "height" means "active region size":

```tsx
// Explicit height
<VirtualList items={results} height={5} freeze renderItem={...} />

// Auto height - measure from children
<VirtualList items={results} height="auto" freeze renderItem={...} />

// No height = everything freezes immediately (pure streaming)
<VirtualList items={results} freeze renderItem={...} />

// Viewport-relative
<VirtualList items={results} height="viewport" freeze renderItem={...} />
```

## Pushing Items

Declarative (same as VirtualList):
```tsx
const [results, setResults] = useState([])
setResults(prev => [...prev, newResult])  // Component handles freezing
```

Imperative (for streaming):
```tsx
const { freeze } = useFreeze()
freeze(<Text>{line}</Text>)
```

## Implementation Layers

1. **FreezeBuffer** - tracks frozen content
2. **Term.writeToScrollback()** - semantic signal (not ANSI, just tells inkx "don't re-render this")
3. **Scheduler awareness** - skip frozen content in re-renders
4. **outputPhaseScrollback()** - new output phase with CSI 2026 wrapping

## Open Questions

1. Should `freeze` be a boolean prop or `overflow="freeze"` enum?
2. Should height be required in freeze mode or auto-detect?
3. Support both declarative (items array) AND imperative (useFreeze)?
4. Mouse wheel support in scrollback? (Terminal handles natively)

## Full Example: Test Reporter

```tsx
function TestReporter() {
  const [results, setResults] = useState<TestResult[]>([])
  const [current, setCurrent] = useState<string | null>(null)

  return (
    <Box flexDirection="column">
      {/* Results freeze to scrollback as added */}
      <VirtualList
        items={results}
        freeze
        renderItem={(r) => (
          <Text color={r.passed ? "green" : "red"}>
            {r.passed ? "✓" : "✗"} {r.name}
          </Text>
        )}
      />

      {/* Active region - always at bottom */}
      <Box>
        <Text>[{'='.repeat(progress)}] {progress}%</Text>
        {current && <Text>Running: {current}</Text>}
      </Box>
    </Box>
  )
}

// Must use inline mode (normal screen = has scrollback)
await render(<TestReporter />, term, { mode: "inline" })
```

## References

- Plan file: /Users/beorn/.claude/plans/iterative-brewing-sky.md
- pi-tui: https://mariozechner.at/posts/2025-11-30-pi-coding-agent/
- Textual inline: https://textual.textualize.io/blog/2024/04/20/behind-the-curtain-of-inline-terminal-applications/
- Rich Live: https://rich.readthedocs.io/en/stable/live.html