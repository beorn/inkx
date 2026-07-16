interface InputStateOptions {
  isActive: boolean
  disabled?: boolean
  color?: string
  placeholderColor?: string
  borderColor: string
  focusBorderColor: string
}

/**
 * Resolve the shared visual and interaction state for text controls.
 *
 * Disabled controls use Sterling's dedicated disabled tokens and reject
 * keyboard/mouse interaction. Enabled controls preserve each component's
 * existing color overrides and focus-border behavior.
 */
export function resolveInputState({
  isActive,
  disabled = false,
  color,
  placeholderColor = "$fg-muted",
  borderColor,
  focusBorderColor,
}: InputStateOptions): {
  interactive: boolean
  textColor: string | undefined
  placeholderColor: string
  borderColor: string
} {
  if (disabled) {
    return {
      interactive: false,
      textColor: "$fg-disabled",
      placeholderColor: "$fg-disabled",
      borderColor: "$border-disabled",
    }
  }

  return {
    interactive: true,
    textColor: color,
    placeholderColor,
    borderColor: isActive ? focusBorderColor : borderColor,
  }
}
