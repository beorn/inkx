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
import React, { useContext, useId } from "react"
import { Box } from "../../components/Box"
import { Link } from "../../components/Link"
import { Text } from "../../components/Text"
import { useFocusable } from "../../hooks/useFocusable"
import { useInput } from "../../hooks/useInput"
import type { LinkProps } from "../../components/Link"
import { ChainAppContext } from "../../context"

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
  /** Optional per-item text color. */
  color?: string
  /** Optional per-item emphasis override. */
  bold?: boolean
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
  isCurrent,
}: {
  item: BreadcrumbItem
  variant: NonNullable<LinkProps["variant"]>
  isCurrent: boolean
}): React.ReactElement {
  const { focused } = useFocusable()
  const chain = useContext(ChainAppContext)
  const activate = (): void => {
    if (item.onPress) item.onPress()
    else if (item.href) chain?.events.emit("link:open", item.href)
  }

  useInput(
    (input, key) => {
      if (key.return || (input === " " && !key.ctrl && !key.meta && !key.shift)) {
        activate()
      }
    },
    { isActive: focused && (item.onPress !== undefined || item.href !== undefined) },
  )

  const label = item.href ? (
    <Link
      href={item.href}
      variant={variant}
      onClick={() => item.onPress?.()}
      inverse={focused}
      wrap="truncate"
      color={item.color ?? (isCurrent ? "$fg" : "$fg-muted")}
      bold={item.bold ?? isCurrent}
    >
      {item.label}
    </Link>
  ) : (
    <Text
      inverse={focused}
      onClick={() => item.onPress?.()}
      mouseCursor="pointer"
      wrap="truncate"
      color={item.color ?? (isCurrent ? "$fg" : "$fg-muted")}
      bold={item.bold ?? isCurrent}
    >
      {item.label}
    </Text>
  )

  return label
}

function ActionableBreadcrumbItem({
  item,
  variant,
  isCurrent,
}: {
  item: BreadcrumbItem
  variant: NonNullable<LinkProps["variant"]>
  isCurrent: boolean
}): React.ReactElement {
  const focusId = useId()
  return (
    <Box
      testID={focusId}
      focusable={item.onPress !== undefined || item.href !== undefined}
      mouseCursor="pointer"
      height={1}
      minWidth={0}
      flexShrink={1}
      overflow="hidden"
    >
      <BreadcrumbItemInteraction item={item} variant={variant} isCurrent={isCurrent} />
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
    return <Box height={1} />
  }

  return (
    <Box height={1} minWidth={0} flexShrink={1} overflow="hidden">
      {items.map((item, i) => {
        const isCurrent = i === currentIndex
        const isActionable = item.href !== undefined || item.onPress !== undefined

        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <Text color="$fg-muted" wrap="truncate">
                {" "}
                {item.separator ?? separator}{" "}
              </Text>
            )}
            {isActionable ? (
              <ActionableBreadcrumbItem item={item} variant={linkVariant} isCurrent={isCurrent} />
            ) : (
              <Text
                color={item.color ?? (isCurrent ? "$fg" : "$fg-muted")}
                bold={item.bold ?? isCurrent}
                wrap="truncate"
              >
                {item.label}
              </Text>
            )}
          </React.Fragment>
        )
      })}
    </Box>
  )
}
