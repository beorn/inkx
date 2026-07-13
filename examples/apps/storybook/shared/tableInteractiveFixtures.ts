export interface TableInteractiveFixtureRow {
  id: string
  run: string
  status: "pending" | "running" | "integrated"
  subject: string
}

function row(index: number): TableInteractiveFixtureRow {
  const ordinal = String(index).padStart(2, "0")
  return {
    id: `run-${ordinal}`,
    run: `Run ${ordinal}`,
    status: index % 5 === 0 ? "pending" : index % 3 === 0 ? "running" : "integrated",
    subject: `Deterministic queue item ${ordinal}`,
  }
}

/** Stable rows used by both the cursor acceptance and the live Storybook preview. */
export const TABLE_CURSOR_ROWS: readonly TableInteractiveFixtureRow[] = Array.from(
  { length: 18 },
  (_, index) => row(index + 1),
)

/** Same identities, deliberately reshuffled around the pinned cursor row. */
export const TABLE_CURSOR_RESHUFFLED_ROWS: readonly TableInteractiveFixtureRow[] = [
  TABLE_CURSOR_ROWS[8]!,
  TABLE_CURSOR_ROWS[2]!,
  TABLE_CURSOR_ROWS[0]!,
  TABLE_CURSOR_ROWS[1]!,
  ...TABLE_CURSOR_ROWS.slice(3, 8),
  ...TABLE_CURSOR_ROWS.slice(9),
]

/** Baseline captured when a live table leaves follow mode. */
export const TABLE_ANCHOR_ROWS = TABLE_CURSOR_ROWS.slice(0, 15)

/** Three unseen IDs plus a reorder; only the unseen IDs count as new. */
export const TABLE_ANCHOR_ROWS_WITH_NEW: readonly TableInteractiveFixtureRow[] = [
  row(21),
  TABLE_ANCHOR_ROWS[4]!,
  row(22),
  ...TABLE_ANCHOR_ROWS.slice(0, 4),
  ...TABLE_ANCHOR_ROWS.slice(5),
  row(23),
]
