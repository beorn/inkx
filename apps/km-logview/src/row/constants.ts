/** Layout + behavior constants shared across LogRow sub-components (indent, collapse threshold, inline-fit margin, pill field set). */

/** Body-line indent (cols). Applied via `paddingLeft` on the body Box so
 * wrapped visual lines stay aligned — NOT via an inline " " prefix in the
 * Text (which only offsets the first visual line of each logical line). */
export const BODY_INDENT = 2

/** Max body lines to show before collapsing behind a "+N more" tail. */
export const BODY_COLLAPSED_MAX_LINES = 3

/** Safety margin (cols) when deciding whether a single-line body fits on
 * the same line as the header. Absorbs slight rendering width differences
 * (emoji, bidi, double-width chars) that a raw `.length` doesn't capture. */
export const INLINE_BODY_FIT_MARGIN = 2

/** Field keys rendered as "pills" — colored bold text carrying the visual
 * grouping for structured categories (e.g. kind, label, token metrics). */
export const PILL_FIELDS = new Set(["kind", "label", "tokens"])
