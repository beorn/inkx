/** Builds popover content for field values and decides whether a rendered segment has "hidden" data (transformed/truncated) worth showing in a popover. */
import type { PopoverContent } from "../Popover.tsx"

/** Produce popover content for a field value. */
export function fieldPopoverContent(
  fieldKey: string,
  fieldLabel: string | undefined,
  rawValue: unknown,
  rendered: string,
): PopoverContent {
  const title = fieldLabel ?? fieldKey
  // Prefer the RAW value for popover (so users see the unrendered data for
  // pills that transform the content, e.g. "user" → "USER"). Fall back to
  // rendered when raw is non-stringy.
  const source = typeof rawValue === "string" ? rawValue : rendered
  const lines = source.length === 0 ? ["(empty)"] : source.split("\n")
  return { title, lines, maxWidth: 80 }
}

/**
 * Decide whether a header segment has "hidden" content worth a popover.
 *
 * Rule: if the rendered string equals the raw string value, nothing is
 * hidden — suppress the popover. Pills whose render() transforms the value
 * (kind: "user" → "USER") legitimately have hidden data (the raw key name)
 * and keep the popover. Identity renders (label passing through verbatim,
 * timestamps) don't.
 *
 * For non-string raw values (objects, numbers), we always allow the popover:
 * the rendered form is necessarily a projection of the raw structure.
 */
export function hasHiddenContent(rendered: string, raw: unknown): boolean {
  if (typeof raw !== "string") return true
  return rendered !== raw
}
