/**
 * <SessionExchangeDivider>
 *
 * Visual separator between exchanges in a `<SessionUpdateList>`.
 *
 * An "exchange" is a silvercode-local concept: one user prompt plus the
 * resulting agent response stream. ACP has no "turn" or "exchange" noun —
 * the protocol only speaks `SessionUpdate` variants. This component is the
 * visual boundary that groups those updates into readable human↔agent pairs.
 *
 * Bead: km-silvercode.acp-session-update-list.
 */
import React from "react"
import { Box } from "silvery"

export function SessionExchangeDivider(): React.ReactElement {
  // Thin horizontal rule between exchanges. marginTop/marginBottom are not
  // supported by flexily — use a Box with padding instead. The 0-height
  // inner box acts as a visual hairline: the parent paddingY gives breathing
  // room without requiring flex gap support.
  return (
    <Box
      flexShrink={0}
      paddingY={0}
      borderStyle="single"
      borderTop={false}
      borderLeft={false}
      borderRight={false}
      borderColor="$border"
    />
  )
}
