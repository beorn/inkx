/**
 * Regression: state-read getters in board-app must NOT call tree.sync(...).
 *
 * tree.sync walks every tracked ViewNode signal — call it from a hot getter
 * and per-frame work scales as O(tracked_nodes × state_reads_per_frame),
 * which makes `km view` hang after sustained navigation. The proper sync is
 * wired as an alien-signals effect in board-app-store.ts that fires when
 * visibleLens actually changes.
 *
 * See @km/all/km-view-tree-sync-in-getter-hang.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

describe("no tree.sync in state-read getters", () => {
  it("board-app.ts does not call tree.sync — that's board-app-store.ts's effect's job", () => {
    const path = join(here, "..", "src", "board", "board-app.ts")
    const src = readFileSync(path, "utf8")

    // Strip comments — the fix's NOTE comment legitimately mentions tree.sync;
    // only executable calls should fail.
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

    expect(
      stripped,
      "board-app.ts must not call tree.sync — it's a state-read module called many times per frame. The proper sync is wired as an alien-signals effect in apps/km-tui/src/state/board-app-store.ts (~line 631). See @km/all/km-view-tree-sync-in-getter-hang.",
    ).not.toMatch(/\btree\.sync\s*\(/)
    expect(stripped).not.toMatch(/\bviewTree\.sync\s*\(/)
  })
})
