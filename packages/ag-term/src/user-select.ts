import type { AgNode, UserSelect } from "@silvery/ag/types"

/** Resolve inherited userSelect; the document root defaults to selectable text. */
export function resolveUserSelect(node: AgNode): "none" | "text" | "contain" {
  let current: AgNode | null = node
  while (current) {
    const value = (current.props as { userSelect?: UserSelect }).userSelect
    if (value === "none" || value === "text" || value === "contain") return value
    current = current.parent
  }
  return "text"
}
