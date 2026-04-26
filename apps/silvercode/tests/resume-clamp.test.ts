/**
 * --resume must clamp the layout to single-session.
 *
 * Background: each pane silvercode renders spawns its own claude + ~5 MCP
 * grandchildren. Spawning grid-2/grid-4 alongside `--resume <id>` would have
 * all panes try to attach to the same session id (which is never what the
 * user wanted) AND multiplies claude+MCP processes, contributing to the
 * resume fork-bomb (`km-silvercode.resume-fork-bomb`). The pure helper
 * `clampLayoutForResume` is the gate.
 */

import { describe, expect, test } from "vitest"
import { clampLayoutForResume } from "../src/index.tsx"

describe("clampLayoutForResume", () => {
  test("no resume → layout passes through unchanged (single)", () => {
    const r = clampLayoutForResume("single", undefined)
    expect(r.layout).toBe("single")
    expect(r.warning).toBe(null)
  })

  test("no resume → layout passes through unchanged (grid-2)", () => {
    const r = clampLayoutForResume("grid-2", undefined)
    expect(r.layout).toBe("grid-2")
    expect(r.warning).toBe(null)
  })

  test("no resume → layout passes through unchanged (grid-4)", () => {
    const r = clampLayoutForResume("grid-4", undefined)
    expect(r.layout).toBe("grid-4")
    expect(r.warning).toBe(null)
  })

  test("resume + single → no clamp, no warning (already minimal)", () => {
    const r = clampLayoutForResume("single", "abc-123")
    expect(r.layout).toBe("single")
    expect(r.warning).toBe(null)
  })

  test("resume + grid-2 → clamps to single, emits warning", () => {
    const r = clampLayoutForResume("grid-2", "abc-123")
    expect(r.layout).toBe("single")
    expect(r.warning).not.toBe(null)
    expect(r.warning).toContain("--resume")
    expect(r.warning).toContain("grid-2")
  })

  test("resume + grid-4 → clamps to single, emits warning", () => {
    const r = clampLayoutForResume("grid-4", "abc-123")
    expect(r.layout).toBe("single")
    expect(r.warning).not.toBe(null)
    expect(r.warning).toContain("grid-4")
  })

  test("empty resume string is treated as no resume (caller normalizes)", () => {
    // Caller passes `undefined` for empty strings, but the helper is pure
    // — it should NOT clamp on an empty-string sentinel. Callers in
    // index.tsx normalize `""` → `undefined` before calling.
    const r = clampLayoutForResume("grid-4", undefined)
    expect(r.layout).toBe("grid-4")
    expect(r.warning).toBe(null)
  })
})
