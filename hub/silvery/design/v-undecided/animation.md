# Animation Design — Better than Ink's useAnimation

**Bead**: km-silvery.animation
**Date**: 2026-04-09

## Ink 7.0's useAnimation (analysis)

### API

```typescript
useAnimation(options?: {
  interval?: number  // default: 100ms
  isActive?: boolean // default: true
}): {
  frame: number      // tick counter
  time: number       // ms since start
  delta: number      // ms since last tick
  reset: () => void
}
```

### What it actually is

Ink's `useAnimation` is **essentially a shared setInterval hook**. It:

- Runs a shared timer (all components use the same ticker — good for consolidation)
- Gives callers raw frame counter + elapsed time
- Callers do all math themselves

Example:

```tsx
const { frame } = useAnimation({ interval: 80 })
const chars = ['⠋', '⠙', '⠹', ...]
return <Text>{chars[frame % chars.length]}</Text>
```

### Strengths

- **Shared timer**: multiple animated components don't fight over tick intervals
- **Simple primitive**: flexible enough for spinners, sine waves, progress bars
- **Low-level**: caller controls all math

### Weaknesses

1. **No interpolation helpers** — caller builds everything
2. **No spring physics** — can't do natural interruptible motion
3. **No sequence/timeline support** — can't chain animations
4. **No interpolated colors** — ANSI palette blending is non-trivial, users shouldn't reimplement
5. **No pause/resume**, only reset
6. **No reduced-motion support**
7. **setInterval polling**: every tick triggers a re-render of every consumer, even if values didn't change
8. **Exit animations not supported** — can't animate on unmount

## Design goals for silvery

1. **Match Ink's primitives** (useAnimation + frame/time/delta) for migration compat
2. **Add spring physics** (Framer Motion / react-spring inspired)
3. **Add interpolation helpers** (numbers, colors, positions)
4. **Leverage silvery's cell-level diffing** — animation frames only re-emit changed cells
5. **Shared scheduler** — one timer, all animations
6. **Reduced motion respect** — useReducedMotion hook
7. **Pause/resume/reverse**
8. **Sequences and parallels**
9. **Exit animations** (animate before unmount)

## API design

### Layer 1: Primitives (Ink-compatible)

```tsx
// Drop-in replacement for Ink's useAnimation
const { frame, time, delta, reset, pause, resume } = useAnimation({
  interval: 80,
  isActive: true,
})
```

Additions over Ink: `pause()`, `resume()`.

### Layer 2: Value interpolation

```tsx
// Spring physics — natural motion
const x = useSpring(targetX, {
  stiffness: 100,
  damping: 15,
  mass: 1,
})
// When targetX changes, x smoothly animates to new value.
// Interruptible — setting a new target mid-animation continues smoothly.

// Timing-based
const opacity = useTiming(visible ? 1 : 0, {
  duration: 300,
  easing: "easeInOut",
})

// Color interpolation
const color = useSpringColor(isActive ? "#ff00ff" : "#888888", {
  stiffness: 80,
})
```

### Layer 3: Imperative controls

```tsx
const controls = useAnimate()

useEffect(() => {
  if (error) {
    controls.sequence([
      { target: "x", to: -5, duration: 50 },
      { target: "x", to: 5, duration: 50 },
      { target: "x", to: -5, duration: 50 },
      { target: "x", to: 0, duration: 50 },
    ])
  }
}, [error])

return <Box marginLeft={controls.values.x}>...</Box>
```

### Layer 4: Presence animations

```tsx
<AnimatePresence>
  {show && (
    <AnimatedBox
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: "spring", stiffness: 100 }}
    >
      Content
    </AnimatedBox>
  )}
</AnimatePresence>
```

Note: terminal "opacity" = color dimming (not transparency). Document this.

## Leveraging silvery's cell-level diffing

**The key differentiator**: when an animation changes a prop, silvery can figure out which cells actually changed visually and only emit those. Ink would re-emit the whole row.

Example: animating text color from red to green on a single word.

- Silvery: emits ~5 cells of updated fg
- Ink: emits the whole line (because ANSI escapes changed)

**Integration points:**

1. Animation updates component props
2. React re-renders the component
3. silvery's dirty tracking marks only changed nodes
4. Pipeline runs cell diff
5. Only changed cells emit

**Performance expectation**: animation frames should be cheaper in silvery than Ink because of cell-level diffing.

## Shared scheduler

Ink uses a single shared `setInterval`. Silvery should do the same, but:

- **Coalesce re-renders**: if multiple components tick on the same frame, batch their setStates into one React commit
- **Adaptive rate**: if content is expensive to render, slow down automatically
- **maxFps integration**: silvery's runtime already has maxFps concept — integrate with it

## Color interpolation

Terminal colors are tricky — 256-color palette, truecolor, or 16-color. Silvery already has:

- `blend()`, `brighten()`, `darken()` in @silvery/theme
- `hexToRgb` / `rgbToHex` / `hexToHsl`
- `parseColor()`

Animation should use these for smooth transitions.

**Reduced palette fallback**: when on 16-color terminal, interpolate in RGB then quantize to nearest.

## Reduced motion

```tsx
const reduced = useReducedMotion()
const x = useSpring(targetX, {
  stiffness: reduced ? Infinity : 100,
})
```

Read from `PREFERS_REDUCED_MOTION` env var or silvery setting.

## Effort estimate (phased)

### Phase 1: Match Ink API (~1 day)

- useAnimation with shared scheduler
- Pause/resume/reset
- Tests

### Phase 2: Interpolation primitives (~2-3 days)

- useSpring(target, options) for numbers
- useTiming(target, options) with easings
- useSpringColor for colors
- useReducedMotion

### Phase 3: Imperative controls (~2 days)

- useAnimate with sequence/parallel
- Timeline composition
- Tests

### Phase 4: Presence animations (~2-3 days)

- AnimatePresence component
- exit animations
- Integration with React reconciler for unmount timing

### Phase 5: Polish (~1 day)

- Docs
- Examples
- Migration guide from Ink useAnimation
- Benchmark: animation frame cost vs Ink

**Total: ~8-10 days for full system. Phase 1 alone (~1 day) gives parity with Ink.**

## Priority

**This is lower priority than perf work.** Ship Phase 1 only as Ink parity, defer Phases 2-5 until there's user demand. Animation is cool but not a blocker — km and most TUI apps don't need it.

**Recommended order:**

1. Complete km-silvery.perf Tier 1 fixes (Phase 7a, bench-usestate, etc)
2. Phase 1 of animation (Ink parity, ~1 day)
3. Ship v1
4. Wait for user requests before doing Phases 2-5

## Open questions

1. **useCallback vs state updates**: Should spring values trigger React re-renders on every frame, or use refs + forceUpdate?
2. **Animating layout**: Triggering layout on every frame breaks perf. Should we have a `useSpringLayout` that writes directly to screenRect instead of going through React props?
3. **Cell-level updates without React**: Could animation frames directly write to the TerminalBuffer bypassing React? Would be fast but complex.
4. **Exit animation coordination**: React doesn't natively wait for animation before unmount. Need a portal or delayed-unmount pattern.

These are implementation questions for Phases 3-5, not blockers for Phase 1.
