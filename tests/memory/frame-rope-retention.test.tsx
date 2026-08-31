/**
 * @failure  A retained render frame pinned one string per PAINTED ROW instead
 *           of one per frame. The output phase builds a frame by repeated
 *           concatenation, and JavaScriptCore represents that as an unresolved
 *           ROPE whose every operand stays alive as its own `JSString`. At
 *           2000 rows this retained 8,977 string nodes per commit and grew
 *           post-GC RSS by 1.137 MB/commit with no upper bound.
 * @level    l2
 * @consumer every silvery render host
 *
 * The discriminator is LINE COUNT, not byte count: the same total bytes as
 * many short lines pins hundreds of times the string nodes it pins as a few
 * long lines. This test drives both arms at equal bytes and asserts the
 * retained string-node count per commit stays bounded in both.
 *
 * It deliberately does NOT assert on `heapUsed`. A JSC string cell is small
 * while its character data is malloc'd off the GC heap, so `heapUsed` barely
 * moved across the whole defect and would have passed while it ran — the
 * observation that sent bead
 * `pm/@i/1-instruments/silvery-render-path-leaks-off-heap` looking off-heap in
 * the first place. Counting retained string NODES measures the thing that
 * actually grew.
 *
 * Recorded before-numbers (2000 rows, 120-commit steady-state window, Bun):
 * string nodes +1,077,212 (8,977/commit) before, +599 (5.0/commit) after.
 */
import React from "react"
import { describe, test, expect } from "vitest"
import { act } from "react"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"

/** Equal bytes in both arms: 400 x 30 === 20 x 600. */
const SHORT_ROWS = 400
const SHORT_LEN = 30
const LONG_ROWS = 20
const LONG_LEN = 600

const WARMUP = 8
const WINDOW = 30
const DIMS = { cols: 200, rows: 50 }

/**
 * Retained string nodes per commit must stay well under one per painted row.
 * The rope defect retained ~4.5 per row per commit; a frame stored as a single
 * flat string retains a handful per commit regardless of row count. A bound of
 * one quarter of a row per commit sits between those by two orders of
 * magnitude, so it neither trips on ordinary per-commit strings nor tolerates
 * a per-row regression.
 */
const MAX_RETAINED_STRINGS_PER_COMMIT = SHORT_ROWS / 4

interface BunGlobal {
  Bun?: { gc(sync: boolean): void; generateHeapSnapshot(): unknown }
}

function gc(): void {
  const b = (globalThis as BunGlobal).Bun
  if (!b?.gc) return
  // JSC clears in waves — WeakMap-backed signal entries, layout-effect
  // cleanups and fiber slots settle in separate passes.
  b.gc(true)
  b.gc(true)
  b.gc(true)
}

/** Live `string` cell count from Bun's heap snapshot, or null when unavailable. */
function stringNodeCount(): number | null {
  const b = (globalThis as BunGlobal).Bun
  if (!b?.generateHeapSnapshot) return null
  const snap = b.generateHeapSnapshot() as { nodeClassNames?: string[]; nodes?: number[] }
  const names = snap.nodeClassNames
  const nodes = snap.nodes
  if (!names || !nodes) return null
  const stringClass = names.indexOf("string")
  if (stringClass < 0) return null
  // Bun packs nodes as fixed-width records with the class index third.
  let count = 0
  for (let i = 0; i < nodes.length; i += 4) {
    if (nodes[i + 2] === stringClass) count++
  }
  return count
}

function Rows({ count, len, salt }: { count: number; len: number; salt: number }) {
  return (
    <Box flexDirection="column">
      {Array.from({ length: count }, (_, i) => (
        <Text key={i}>{`${salt}:${i} `.padEnd(len, "x")}</Text>
      ))}
    </Box>
  )
}

/** Retained string nodes gained per commit across a post-warmup window. */
async function retainedStringsPerCommit(count: number, len: number): Promise<number | null> {
  const render = createRenderer({ ...DIMS, incremental: true })
  const tree = (salt: number) => <Rows count={count} len={len} salt={salt} />
  let app = await act(async () => render(tree(0)))
  try {
    await act(async () => {
      await app.waitForLayoutStable()
    })
    for (let i = 1; i <= WARMUP; i++) {
      await act(async () => {
        app = render(tree(i))
      })
    }
    gc()
    const before = stringNodeCount()
    if (before === null) return null
    for (let i = WARMUP + 1; i <= WARMUP + WINDOW; i++) {
      await act(async () => {
        app = render(tree(i))
      })
    }
    gc()
    const after = stringNodeCount()
    if (after === null) return null
    return (after - before) / WINDOW
  } finally {
    await act(async () => {
      app.unmount()
    })
  }
}

describe("retained frames do not pin one string per painted row", () => {
  test(`${SHORT_ROWS} short rows retain a bounded number of strings per commit`, async () => {
    const perCommit = await retainedStringsPerCommit(SHORT_ROWS, SHORT_LEN)
    if (perCommit === null) return // heap snapshot unavailable on this runtime
    expect(
      perCommit,
      `retained ${perCommit.toFixed(1)} string nodes per commit over ${SHORT_ROWS} rows — ` +
        "a frame held as an unresolved rope pins one string per painted row",
    ).toBeLessThan(MAX_RETAINED_STRINGS_PER_COMMIT)
  }, 300_000)

  test("the same total bytes as a few long rows also stays bounded", async () => {
    // The control that proves the bound is about line COUNT, not byte count:
    // this arm renders identical total bytes and was already flat before the
    // fix, so it must stay flat after it.
    const perCommit = await retainedStringsPerCommit(LONG_ROWS, LONG_LEN)
    if (perCommit === null) return
    expect(perCommit).toBeLessThan(MAX_RETAINED_STRINGS_PER_COMMIT)
  }, 300_000)
})
