/**
 * Toast notification component - displays temporary notifications above bottom bar
 */
import React from "react"
import { Box, Text } from "inkx"
import type { Toast as ToastType } from "@km/core"

interface ToastProps {
  toast: ToastType
  termWidth: number
}

/**
 * Toast component - renders a single toast notification
 *
 * Format: [icon] message [action] Esc
 * - Icon depends on level (info/success/warning/error)
 * - Action shown if present (keyboard shortcut in brackets)
 * - Esc shown if dismissible
 */
export function Toast({ toast, termWidth }: ToastProps): React.ReactElement {
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

  // Build toast content: [icon] message [action] Esc
  const parts: string[] = [`${icon} ${toast.message}`]

  // Add action button if present (show keyboard shortcut)
  if (toast.action && typeof toast.action.trigger === "string") {
    parts.push(`[${toast.action.trigger}] ${toast.action.label}`)
  }

  // Add Esc hint if dismissible
  if (toast.dismissible !== false) {
    parts.push("Esc")
  }

  const content = parts.join("  ")

  // Description on second line if present
  const hasDescription = !!toast.description

  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      width={termWidth}
      id="toast"
      data-level={toast.level}
      data-toast-id={toast.id}
    >
      <Box width={termWidth} paddingLeft={1} paddingRight={1}>
        <Text color={color} wrap="truncate-end">
          {content}
        </Text>
      </Box>
      {hasDescription && (
        <Box width={termWidth} paddingLeft={3} paddingRight={1}>
          <Text dimColor wrap="truncate-end">
            {toast.description}
          </Text>
        </Box>
      )}
    </Box>
  )
}
