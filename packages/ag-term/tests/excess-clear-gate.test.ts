/**
 * Exhaustive table for requireExcessClearGate (km 20835 slice 2).
 *
 * The excess-clear decision is the clear-decision cluster's one extracted
 * pure predicate (12640 promoted the four-condition runtime guard to a
 * structural invariant: sole constructor, branded gate). This table locks all
 * 2^4 = 16 input combinations so any refactor of the gate — or the
 * paint-clear-l5 Step 6 fold that eventually DELETES clearExcessArea (and
 * this table with it) — is provably behavior-preserving until the deletion.
 *
 * Restated spec: a gate exists ⟺ bufferIsCloned ∧ layoutChanged ∧
 * prevLayout≠null ∧ hasPrevBuffer; the gate carries that prevLayout.
 */
import { describe, expect, test } from "vitest"
import { requireExcessClearGate } from "../src/pipeline/render-phase"

describe("requireExcessClearGate — exhaustive 16-case table", () => {
  const PREV = { x: 1, y: 2, width: 10, height: 5 }

  test("all 16 combinations match the restated four-condition spec", () => {
    let checked = 0
    for (const bufferIsCloned of [false, true]) {
      for (const layoutChanged of [false, true]) {
        for (const prevLayout of [null, PREV] as const) {
          for (const hasPrevBuffer of [false, true]) {
            const gate = requireExcessClearGate(
              bufferIsCloned,
              layoutChanged,
              prevLayout,
              hasPrevBuffer,
            )
            const expected = bufferIsCloned && layoutChanged && prevLayout !== null && hasPrevBuffer
            const label = `cloned=${bufferIsCloned} layout=${layoutChanged} prev=${prevLayout !== null} buf=${hasPrevBuffer}`
            expect(gate !== null, label).toBe(expected)
            if (gate !== null) {
              // The gate carries the prevLayout it validated — the geometry
              // clearExcessArea clears against.
              expect((gate as unknown as { prevLayout: typeof PREV }).prevLayout, label).toBe(PREV)
            }
            checked++
          }
        }
      }
    }
    expect(checked).toBe(16)
  })

  test("the second-pass wrong-order shape (cloned buffer, no prev buffer) is unrepresentable", () => {
    // The exact bug that motivated the invariant (silvery 168b4989): a
    // second-pass dispatch has bufferIsCloned=true but hasPrevBuffer=false.
    expect(requireExcessClearGate(true, true, PREV, false)).toBeNull()
  })
})
