/**
 * Toast stack component - shadcn/ui style stacked toasts in bottom-right corner
 *
 * Displays up to 5 toasts stacked vertically with borders and black backgrounds.
 */
import React from "react"
import { Box, Text } from "inkx"
import type { Toast as ToastType } from "@km/core"

interface ToastStackProps {
  toasts: ToastType[]
  termWidth: number
  termHeight: number
}

/**
 * Single toast item in the stack
 */
function ToastItem({ toast }: { toast: ToastType }): React.ReactElement {
  const icons = {
    info: "ℹ",
    success: "✓",
    warning: "⚠",
    error: "✗",
  } as const

  const colors = {
    info: "cyan" as const,
    success: "green" as const,
    warning: "yellow" as const,
    error: "red" as const,
  }

  const icon = icons[toast.level]
  const color = colors[toast.level]

  // Build toast content: [icon] message [action]
  const parts: string[] = [`${icon} ${toast.message}`]

  // Add action button if present (show keyboard shortcut)
  if (toast.action && typeof toast.action.trigger === "string") {
    parts.push(`[${toast.action.trigger}] ${toast.action.label}`)
  }

  const content = parts.join("  ")

  // Determine if we should show items individually
  const threshold = toast.itemThreshold ?? 3
  const shouldShowItems = toast.items && toast.items.length > 0 && toast.items.length < threshold

  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      borderStyle="round"
      borderColor="white"
      backgroundColor="black"
      paddingLeft={1}
      paddingRight={1}
      minWidth={40}
      maxWidth={60}
      id="toast"
      data-level={toast.level}
      data-toast-id={toast.id}
    >
      {/* Main message */}
      <Text color={color} wrap="truncate-end">
        {content}
      </Text>
      {/* Description on second line if present */}
      {toast.description && (
        <Text dimColor wrap="truncate-end">
          {toast.description}
        </Text>
      )}
      {/* Show individual items if below threshold */}
      {shouldShowItems && toast.items!.map((item, i) => (
        <Text key={i} dimColor wrap="truncate-end">
          {"  • " + item}
        </Text>
      ))}
    </Box>
  )
}

/**
 * Toast stack - displays multiple toasts in bottom-right corner
 *
 * Mimics shadcn/ui toast behavior:
 * - Shows latest 5 toasts
 * - Stacked vertically from bottom to top
 * - Each toast has border and black background
 * - Positioned in bottom-right corner
 */
export function ToastStack({
  toasts,
  termWidth,
  termHeight,
}: ToastStackProps): React.ReactElement | null {
  if (toasts.length === 0) return null

  // Show latest 5 toasts (newest at bottom)
  const visibleToasts = toasts.slice(-5)

  // Position in bottom-right corner using margins
  // Calculate margins to push toasts to bottom-right
  const toastMaxWidth = 62 // Max toast width (60) + border (2)
  const marginRight = 2
  const bottomBarHeight = 1

  // Calculate approximate height needed for all toasts
  // Each toast is roughly 3-4 lines (border + content + possible description + gap)
  const estimatedHeight = visibleToasts.reduce((total, t) => {
    const hasDescription = !!t.description
    return total + (hasDescription ? 4 : 3) + 1 // +1 for gap
  }, 0)

  const marginTop = Math.max(0, termHeight - bottomBarHeight - estimatedHeight)
  const marginLeft = Math.max(0, termWidth - toastMaxWidth - marginRight)

  return (
    <Box
      position="absolute"
      flexDirection="column-reverse" // Stack from bottom to top (newest at bottom)
      marginTop={marginTop}
      marginLeft={marginLeft}
      gap={1}
    >
      {visibleToasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </Box>
  )
}
