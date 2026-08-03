/**
 * Breadcrumb Component
 *
 * Navigation breadcrumb trail with configurable separators.
 * Highlights the last item as the current/active page.
 *
 * Usage:
 * ```tsx
 * <Breadcrumb
 *   items={[
 *     { label: "Home" },
 *     { label: "Settings" },
 *     { label: "Profile" },
 *   ]}
 *   separator=">"
 * />
 * // Renders: Home > Settings > Profile
 * ```
 */
import React, { useId } from "react"
import { Box } from "../../components/Box"
import { Link } from "../../components/Link"
import { Text } from "../../components/Text"
import { useFocusable } from "../../hooks/useFocusable"
import { useInput } from "../../hooks/useInput"
import type { LinkProps } from "../../components/Link"

// =============================================================================
// Types
// =============================================================================

export interface BreadcrumbItem {
  /** Display label */
  label: string
  /** Optional destination exposed as a native terminal hyperlink. */
  href?: string
  /** Cross-platform activation callback for mouse, keyboard, or future pointer targets. */
  onPress?: () => void
  /** Optional separator rendered before this item. */
  separator?: string
}

export interface BreadcrumbProps {
  /** Breadcrumb items (left to right) */
  items: BreadcrumbItem[]
  /** Separator character between items (default: "/") */
  separator?: string
  /** Link arming behavior for actionable items (default: plain hover). */
  linkVariant?: LinkProps["variant"]
  /** Item rendered as the current location (default: the last item). */
  currentIndex?: number
}

// =============================================================================
// Component
// =============================================================================

/**
 * Horizontal breadcrumb trail.
 *
 * Renders items separated by a configurable separator character.
 * The last item is rendered in bold `$fg` as the current location;
 * preceding items are rendered in `$fg-muted`.
 */
function BreadcrumbItemInteraction({
  item,
  variant,
}: {
  item: BreadcrumbItem
  variant: NonNullable<LinkProps["variant"]>
}): React.ReactElement {
  const { focused } = useFocusable()

  useInput(
    (input, key) => {
      if (key.return || (input === " " && !key.ctrl && !key.meta && !key.shift)) {
        item.onPress?.()
      }
    },
    { isActive: focused && item.onPress !== undefined },
  )

  const label = item.href ? (
    <Link href={item.href} variant={variant} onClick={() => item.onPress?.()} inverse={focused}>
      {item.label}
    </Link>
  ) : (
    <Text color="$fg-link" inverse={focused} onClick={() => item.onPress?.()} mouseCursor="pointer">
      {item.label}
    </Text>
  )

  return label
}

function ActionableBreadcrumbItem({
  item,
  variant,
}: {
  item: BreadcrumbItem
  variant: NonNullable<LinkProps["variant"]>
}): React.ReactElement {
  const focusId = useId()
  return (
    <Box testID={focusId} focusable={item.onPress !== undefined} mouseCursor="pointer">
      <BreadcrumbItemInteraction item={item} variant={variant} />
    </Box>
  )
}

export function Breadcrumb({
  items,
  separator = "/",
  linkVariant = "arm-on-hover",
  currentIndex = items.length - 1,
}: BreadcrumbProps): React.ReactElement {
  if (items.length === 0) {
    return <Box />
  }

  return (
    <Box>
      {items.map((item, i) => {
        const isCurrent = i === currentIndex
        const isActionable = item.href !== undefined || item.onPress !== undefined

        return (
          <React.Fragment key={i}>
            {i > 0 && <Text color="$fg-muted"> {item.separator ?? separator} </Text>}
            {isActionable ? (
              <ActionableBreadcrumbItem item={item} variant={linkVariant} />
            ) : (
              <Text color={isCurrent ? "$fg" : "$fg-muted"} bold={isCurrent}>
                {item.label}
              </Text>
            )}
          </React.Fragment>
        )
      })}
    </Box>
  )
}
