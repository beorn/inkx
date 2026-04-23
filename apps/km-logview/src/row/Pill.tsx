/** Pill component: renders a colored bold inline label (e.g. KIND, label) with cursor-aware color override. */
import React from "react"
import { Text } from "silvery"

export function Pill({
  color,
  bold,
  isCursor,
  children,
}: {
  color: string | undefined
  bold: boolean
  isCursor: boolean
  children: React.ReactNode
}) {
  // Pills are "groupings with a name" — rendered as plain colored bold text.
  // Shape carries meaning via content (KIND, label) + surrounding spacing.
  return (
    <Text color={isCursor ? "$fg-cursor" : color} bold={bold || undefined}>
      {children}
    </Text>
  )
}
