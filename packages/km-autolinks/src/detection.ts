/**
 * Generic `Detection` shape used by the autolinks pipeline.
 *
 * Consumers (silvercode) layer their own detection kinds (bead, file,
 * code-ref, km-node) on top of this. The autolinks package only emits
 * `kind: "autolink"` detections from `detectAutolinks` and accepts the
 * generic shape on the builtins side of `mergeDetections`.
 *
 * `K` defaults to `string` so consumers can extend the kind vocabulary
 * without forking the type. Within this package we always emit
 * `kind === "autolink"` (`AutolinkDetection`).
 */
export type Detection<K extends string = string> = {
  kind: K
  /** Matched string exactly as it appeared. */
  match: string
  /** Start/end offsets within the input text. */
  start: number
  end: number
  /** Kind-specific payload used by resolvers. */
  payload: Record<string, string>
}

/** A detection emitted by `detectAutolinks` — always `kind: "autolink"`. */
export type AutolinkDetection = Detection<"autolink">
