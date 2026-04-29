---
id: "@km/silvery/wheel-windowed-buffer"
aliases:
  - km-silvery.wheel-windowed-buffer
  - km-silvery-wheel-windowed-buffer
created_by: claude:c56dc5d6
created_at: 2026-04-23T18:53:26Z
owner: bjorn@stabell.org
---

# [ ] Replace scalar velocity + heuristics with windowed event buffer for wheel momentum @km/silvery #feature #P2

Seven patches accumulated on a scalar \`velocityRef\` in the last few sessions:

| Patch | Fix | Bug class |
|---|---|---|
| EMA smoothing α=0.3 | single-event jitter flipping sign | per-event noise |
| sign-aware reset | absorbed reversals | "intent vs tail" confusion |
| revert sign-reset | tail events misread as reversals | same, opposite direction |
| ACCEL 5→3, MAX_V 60→40 | fast scroll jumpy | peak velocity too high |
| TAIL_VELOCITY_THRESHOLD=15 | tail events producing immediate disp | velocity-scalar below threshold |
| momentumDir capture | tail events during momentum | velocityRef zeroed in enterMomentum |
| preserve velocity across momentum | stray events post-reset slipping through | same root |

Each patch solves one hole and opens latent space for the next. The pattern is the smell: a scalar evolving per-event via EMA + thresholds cannot structurally encode gestural intent.

## Reframe: windowed event buffer

Replace the scalar + heuristics stack with a **time-windowed event buffer**:

```ts
// Ring of { t, rows } over the last WHEEL_WINDOW_MS (~150ms)
const wheelBufferRef = useRef<Array<{ t: number; rows: number }>>([])

// On each wheel event: push signed rows into buffer, trim, apply immediate disp.
// On release: velocity = sum(rows) / spanMs * 1000 → start momentum.
```

## What it solves structurally (no thresholds)

- **Sign-flip**: one opposite event is a minority in the sum; dominant direction always wins unless the window is dominated by opposites (= intentional reversal — correct).
- **Tail suppression**: tail events contribute their real weight — no need for velocity threshold.
- **Zeroing trap**: no scalar state to zero across momentum; buffer empties when events stop.
- **Reversal**: new opposite events dominate the window within human reaction time (~100-150ms), and next release fires in new direction.

## Deletes

- WHEEL_VELOCITY_SMOOTHING
- KINETIC_TAIL_VELOCITY_THRESHOLD
- velocityRef smoothing logic
- velocityRef preservation-across-momentum logic
- momentumDir capture (for tail check)
- sign-comparison branches in handleWheel

Estimated net: −50 to −80 LOC.

## Acceptance

- `wheel-monotonic` test passes (regression: rapid flick + OS tail stays monotonic).
- `wheel-scrolls-viewport` + `scrollbar-overlay` pass (no UX regression).
- New test: scroll-up with 30% injected opposite-direction noise still results in up-scroll momentum (not down).
- New test: rapid intentional reversal (up flick, pause 200ms, down flick) starts down-momentum.
- `rg "KINETIC_TAIL_VELOCITY_THRESHOLD|WHEEL_VELOCITY_SMOOTHING" vendor/silvery/packages/ag-react/src/ui/components/ListView.tsx` → 0 hits.
- `rg "velocityRef" ListView.tsx` → 0 hits (entire scalar deleted).
- `bun vitest run --project vendor vendor/silvery/tests/ui/list-view*.test.tsx vendor/silvery/tests/features/listview-*.test.tsx` passes (35+ tests).

## Out of scope

- Moving useKineticScroll into Box (silvery core). Separate bead (@km/silvery/kinetic-box-default).
- Deleting momentum entirely (user asked for iOS-style kinetic).

## References

- Log evidence in wheel2.log: lines 50-52 show the scalar-velocity trap that required the 6th patch (momentum-direction capture).
- `/big` analysis in session 2026-04-23.