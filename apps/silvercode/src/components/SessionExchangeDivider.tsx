/**
 * <SessionExchangeDivider>
 *
 * Visual separator between exchanges in a `<SessionUpdateList>`.
 *
 * An "exchange" / chat turn is a silvercode-local presentation concept:
 * an idle-delimited burst of prompts, messages, and activity. ACP has no
 * canonical "turn" noun — the protocol only speaks `SessionUpdate`
 * variants. This component is a visual boundary, not a protocol boundary.
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
