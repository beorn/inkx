/**
 * <SessionRetry>
 *
 * Inline retry button rendered below a failed exchange.
 *
 * Re-emits the last user prompt to the agent when clicked. The caller
 * supplies the `onRetry` handler — typically `controller.send(sessionId,
 * lastUserText)`. This component is purely presentational: it surfaces the
 * affordance, fires the callback, and the session resumes.
 *
 * Bead: km-silvercode.acp-session-update-list.
 */
import React from "react"
import { Box, Muted, Text } from "silvery"

export interface SessionRetryProps {
  /** Text of the last user prompt — shown truncated so the user can confirm
   *  they're retrying the right turn. */
  lastPrompt?: string
  /** Called when the user clicks ↻ retry or presses Enter on this affordance. */
  onRetry?: () => void
}

export function SessionRetry({ lastPrompt, onRetry }: SessionRetryProps): React.ReactElement {
  return (
    <Box
      flexDirection="row"
      gap={1}
      paddingY={0}
      onClick={onRetry}
      borderStyle="single"
      borderColor="$warning"
      borderTop={false}
      borderBottom={false}
      borderRight={false}
    >
      <Text color="$warning">↻</Text>
      <Text color="$warning" bold>
        retry
      </Text>
      {lastPrompt ? (
        <Box flexShrink={1} minWidth={0}>
          <Muted wrap="truncate">{lastPrompt}</Muted>
        </Box>
      ) : null}
    </Box>
  )
}
