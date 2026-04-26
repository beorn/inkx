/**
 * <SessionExchangeDivider> — visual hairline between two sample exchanges.
 *
 * The divider is a borderBottom-only Box. This story places a divider
 * between two prose blocks so the hairline is visually verifiable in
 * context.
 */
import React from "react"
import { Box, Screen, Text } from "silvery"
import { SessionExchangeDivider } from "../../src/components/SessionExchangeDivider.tsx"
import type { Story } from "../types.ts"

export const sessionExchangeDividerBetweenExchanges: Story = {
  id: "SessionExchangeDivider/between-exchanges",
  component: "SessionExchangeDivider",
  variant: "between-exchanges",
  description: "Hairline divider sandwiched between two sample exchange blocks.",
  render() {
    return (
      <Screen flexDirection="column">
        <Box flexDirection="column" padding={1} gap={0}>
          {/* Exchange 1 */}
          <Box flexDirection="column" paddingY={1}>
            <Text bold color="$primary">
              You
            </Text>
            <Text>List the files in src/</Text>
          </Box>
          <Box flexDirection="column" paddingY={1}>
            <Text bold color="$accent">
              Claude
            </Text>
            <Text>Sure — running ls.</Text>
          </Box>

          {/* Divider */}
          <SessionExchangeDivider />

          {/* Exchange 2 */}
          <Box flexDirection="column" paddingY={1}>
            <Text bold color="$primary">
              You
            </Text>
            <Text>Now recurse into components/</Text>
          </Box>
          <Box flexDirection="column" paddingY={1}>
            <Text bold color="$accent">
              Claude
            </Text>
            <Text>Found 8 files in components/.</Text>
          </Box>
        </Box>
      </Screen>
    )
  },
}
