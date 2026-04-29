---
id: "@km/silvery/animation"
aliases:
  - km-silvery.animation
  - km-silvery-animation
created_by: Bjørn Stabell
created_at: 2026-04-09T14:38:34Z
closed_at: 2026-04-09T15:56:16Z
close_reason: Phase 1 implemented. useAnimation hook + 8 tests. Commit 0c4109c4.
---

# [x] Review Ink's useAnimation — design a better silvery version @km/silvery #task #P1 @Bjørn Stabell

Ink 7.0 has useAnimation. Silvery doesn't have built-in animation primitives. Review Ink's approach and design a better one for silvery.

## Investigation

### Read Ink's implementation
- node_modules/ink/build/hooks/use-animation.d.ts
- node_modules/ink/build/hooks/use-animation.js
- What primitives? Keyframes? Springs? Timing?
- How does it trigger re-renders? (setInterval? requestAnimationFrame equivalent?)
- What's the frame rate? Fixed or adaptive?
- Cancellation? Pause/resume?

### Map to silvery's architecture
Silvery has:
- Dirty tracking (incremental render)
- Layout engine (Flexily)
- Output phase with cell-level diffing
- Pipeline phases that can be re-run

Animation needs:
- A way to trigger re-renders on a timer
- Interpolated values (number, color, position)
- Smart invalidation (only re-render what changed)
- Integration with the pipeline

## Design goals for silvery's version

1. **Leverage cell-level dirty tracking** — only re-emit cells that actually changed (silvery's advantage)
2. **Spring physics** — interruptible, natural motion (inspired by Framer Motion, react-spring)
3. **Composable** — works with any prop (color, position, size, opacity-equivalent)
4. **Timeline support** — sequences, parallels, staggers
5. **No setInterval polling** — use requestAnimationFrame equivalent (silvery has maxFps concept)
6. **Reduced motion respect** — useReducedMotion hook
7. **Pausable/cancelable**
8. **Exit animations** — animate before unmount

## API sketch

\`\`\`tsx
// Simple
const count = useSpring(targetCount, { stiffness: 100, damping: 15 })

// Keyframes
const [opacity] = useTiming(0, 1, { duration: 300, easing: easeInOut })

// Color transitions  
const color = useSpring(isActive ? '#f00' : '#888')

// Sequences
const controls = useAnimate()
useEffect(() => {
  controls.sequence([
    { to: { x: 10 }, duration: 100 },
    { to: { x: 0 }, duration: 100 },
  ])
}, [error])
\`\`\`

## Open questions

1. How to handle animating COLORS in terminal (limited palette, interpolation)?
2. How to animate LAYOUT (does triggering layout on every frame break perf?)
3. Should we animate cell-level or component-level?
4. requestAnimationFrame equivalent — what does silvery's runtime provide?
5. Can we piggyback on existing scheduler / raf batching?

## Output
- Analysis doc: vendor/internal/silvery/design/v-undecided/animation.md
- Prototype in vendor/internal/silvery/prototype/animation/
- API design with examples
- Benchmark: silvery animation vs Ink useAnimation