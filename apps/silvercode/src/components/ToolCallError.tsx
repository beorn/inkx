/**
 * <ToolCallError>
 *
 * Error envelope for a failed ACP tool call (`status: "failed"`). Distinct
 * visual treatment from a successful tool result so the eye lands on the
 * failure within a long stream of completed calls.
 *
 * Renders:
 *   - Red border via `$error`
 *   - Red ✗ glyph + concise error label in the header row
 *   - Stack trace / multi-line message below, wrapped with $error coloring
 *   - Retry chevron on the right (visual affordance — wiring is the
 *     consumer's job, e.g. App-level command bound to a ToolCallId)
 *
 * Distinct from a generic error result row because:
 *   - Always expanded (errors hide nothing)
 *   - No collapse toggle (a failed call is not a routine result)
 *   - Carries a retry affordance hook (`onRetry` callback)
 *
 * Bead: km-silvercode.acp-tool-call.
 */

import React from "react"
import { Box, Muted, Text } from "silvery"

export interface ToolCallErrorProps {
  /** Short error label rendered after the ✗ glyph (e.g. "ENOENT", "exit 1"). */
  label?: string
  /**
   * Full error body — typically a stack trace, exit-code summary, or
   * multi-line stderr capture. Rendered with `$error` coloring and `wrap`.
   */
  message: string
  /**
   * Optional retry hook. When present, renders a "↻ retry" affordance in
   * the header. Wiring the retry is the consumer's responsibility — this
   * component just exposes the click target.
   */
  onRetry?: () => void
}

export function ToolCallError({ label, message, onRetry }: ToolCallErrorProps): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      paddingX={1}
      paddingY={0}
      borderStyle="single"
      borderColor="$error"
      borderTop={false}
      borderBottom={false}
      borderRight={false}
    >
      <Box flexDirection="row" gap={1}>
        <Text bold color="$error">
          ✗
        </Text>
        <Text bold color="$error">
          {label ?? "Error"}
        </Text>
        <Box flexGrow={1} />
        {onRetry ? (
          // Retry affordance — onClick fires the retry callback. Keep it
          // visually subtle ($muted) until the user hovers; same convention
          // as Accordion's chevron.
          <Box onClick={onRetry}>
            <Muted>↻ retry</Muted>
          </Box>
        ) : null}
      </Box>
      <Box paddingLeft={2} flexDirection="column">
        <Text color="$error" wrap="wrap">
          {message}
        </Text>
      </Box>
    </Box>
  )
}
