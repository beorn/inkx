/**
 * Toast stack component - shadcn/ui style stacked toasts in bottom-right corner
 *
 * Displays up to 5 toasts stacked vertically with borders and black backgrounds.
 */
import React from "react"
import { Box, Text, Small } from "@silvery/react"
import type { Toast as ToastType } from "@km/core"
import { BOTTOM_BAR_HEIGHT } from "./board-layout.ts"

interface ToastStackProps {
  toasts: ToastType[]
  termWidth: number
  termHeight: number
}

/**
 * Simple ASCII progress bar: [████░░░░░░] 40%
 */
function ProgressBar({ progress, color }: { progress: number; color: string }): React.ReactElement {
  const barWidth = 10
  const clamped = Math.max(0, Math.min(1, progress))
  const filled = Math.round(clamped * barWidth)
  const empty = barWidth - filled
  const pct = Math.round(clamped * 100)
  return <Text color={color}>{"[" + "\u2588".repeat(filled) + "\u2591".repeat(empty) + "] " + pct + "%"}</Text>
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
    info: "$primary",
    success: "$success",
    warning: "$warning",
    error: "$error",
  }

  const icon = icons[toast.level]
  const color = colors[toast.level]

  // Build toast content: [icon] message [action]
  const parts: string[] = [`${icon} ${toast.message}`]

  // Add action button if present
  if (toast.action) {
    if (typeof toast.action.trigger === "string") {
      parts.push(`[${toast.action.trigger}] ${toast.action.label}`)
    } else {
      // Function trigger (e.g., job cancel) — show Esc hint
      parts.push(`[Esc] ${toast.action.label}`)
    }
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
      borderColor="$border"
      backgroundColor={"$surface-bg"}
      paddingLeft={1}
      paddingRight={1}
      minWidth={40}
      maxWidth={60}
      id="toast"
      data-level={toast.level}
      data-toast-id={toast.id}
    >
      {/* Main message */}
      <Text color={color}>{content}</Text>
      {/* Progress bar */}
      {toast.progress != null && <ProgressBar progress={toast.progress} color={color} />}
      {/* Description on second line if present */}
      {toast.description && <Small>{toast.description}</Small>}
      {/* Show individual items if below threshold */}
      {shouldShowItems && toast.items?.map((item, i) => <Small key={i}>{"  • " + item}</Small>)}
    </Box>
  )
}

/**
 * Toast stack - displays multiple toasts in bottom-right corner
 *
 * Uses column-reverse layout to anchor toasts above the bottom bar.
 * No height estimation needed — flex handles positioning automatically.
 */
export function ToastStack({ toasts, termWidth, termHeight }: ToastStackProps): React.ReactElement | null {
  if (toasts.length === 0) return null

  // Show latest 5 toasts (newest at bottom)
  const visibleToasts = toasts.slice(-5)

  return (
    <Box
      position="absolute"
      height={termHeight}
      width={termWidth}
      flexDirection="column-reverse"
      paddingBottom={BOTTOM_BAR_HEIGHT}
      alignItems="flex-end"
      paddingRight={2}
      pointerEvents="none"
    >
      <Box flexDirection="column-reverse" gap={1}>
        {visibleToasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </Box>
    </Box>
  )
}
