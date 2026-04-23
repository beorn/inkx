import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import React from "react"
import { run } from "silvery/runtime"
import { createTermless } from "@silvery/test"
import { claudeSessionConfig } from "@km/logview/configs/claude-session"
import { loadRows } from "@km/logview/parse-jsonl"
import { describe, expect, test } from "vitest"
import { App } from "../src/App.tsx"
import { clusterRows } from "../src/cluster.ts"

const FIXTURE_HOOKS = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/hooks.jsonl")
const FIXTURE_TINY = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/tiny.jsonl")

/**
 * Hook clustering — adjacent hook rows collapse to a single `◆ N hooks` row.
 *
 * v0 rule: >=2 adjacent hook rows cluster. The tiny fixture has zero hooks,
 * so it's the negative case (no cluster row). The hooks fixture has 3
 * adjacent hook_success attachments between user+assistant — those MUST
 * collapse to a single row on initial render.
 *
 * Pressing Enter on the cluster row expands it in place: the cluster header
 * stays visible plus all 3 child rows render beneath it.
 */

describe("km-agent-view hook clustering", () => {
  test("clusterRows: 3 adjacent hooks collapse to 1 cluster item", () => {
    const rows = loadRows(FIXTURE_HOOKS, claudeSessionConfig)
    const items = clusterRows(rows)

    // Sanity: fixture has 3 hook rows between user+assistant.
    const hookCount = rows.filter((r) => r.kind === "hook").length
    expect(hookCount).toBe(3)

    const clusters = items.filter((it) => it.kind === "cluster")
    expect(clusters.length).toBe(1)
    expect(clusters[0]!.kind === "cluster" && clusters[0]!.rows.length).toBe(3)

    // Non-hook rows are preserved as row items.
    const rowItems = items.filter((it) => it.kind === "row")
    expect(rowItems.length).toBe(rows.length - hookCount)
  })

  test("clusterRows: single hook does NOT cluster", () => {
    // tiny.jsonl has no hook rows; inject a synthetic single-hook run.
    const baseRows = loadRows(FIXTURE_TINY, claudeSessionConfig)
    const solo = { id: "x.att", lineNo: 99, kind: "hook", raw: {}, fields: { time: "", label: "solo", body: "" } }
    const withSolo = [baseRows[0]!, solo, baseRows[1]!]
    const items = clusterRows(withSolo)
    // No clusters — single hook stays a plain row.
    expect(items.every((it) => it.kind === "row")).toBe(true)
    expect(items.length).toBe(3)
  })

  test("renders `◆ 3 hooks` on initial mount; Enter expands to 3 rows", async () => {
    using term = createTermless({ cols: 120, rows: 24 })
    const rows = loadRows(FIXTURE_HOOKS, claudeSessionConfig)
    const handle = await run(<App path={FIXTURE_HOOKS} title="session" rows={rows} />, term)

    // Pre-expand: cluster header visible, children's hook-name labels not.
    let text = term.screen.getText()
    expect(text, "collapsed cluster row should show").toContain("◆ 3 hooks")

    // On mount, cursor is at the last item. Navigate to the cluster:
    // 3 items total after clustering (user, cluster, assistant). Press `k`
    // once to move cursor from the assistant (last) to the cluster (middle).
    await handle.press("k")

    // Expand with Enter.
    await handle.press("Enter")

    // Now expanded: the cluster header still reads "◆ 3 hooks" but the
    // individual hook rows render beneath. Distinct hook-name labels from
    // the fixture (check-1, check-2, check-3) should all appear.
    text = term.screen.getText()
    expect(text).toContain("◆ 3 hooks")
    expect(text).toContain("check-1")
    expect(text).toContain("check-2")
    expect(text).toContain("check-3")

    handle.unmount()
  })
})
