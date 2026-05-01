import React from "react"
import { Box, Screen, Text } from "silvery"
import type { ToolCall as ToolCallType, ToolCallId } from "@km/agent-harness"
import { Content } from "../../src/components/Content.tsx"
import { MarkdownView } from "../../src/components/MarkdownView.tsx"
import { TurnActivitySummary, type TurnActivitySummaryItem } from "../../src/components/TurnActivitySummary.tsx"
import type { Story } from "../types.ts"

const id = (s: string) => s as ToolCallId

function tool(partial: Partial<ToolCallType> & Pick<ToolCallType, "toolCallId" | "title">): ToolCallType {
  return partial
}

const activityItems: TurnActivitySummaryItem[] = [
  {
    id: "read",
    toolCall: tool({
      toolCallId: id("content-story-read"),
      title: "Read src/components/Content.tsx",
      kind: "read",
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: "Content.Row provides lane slots." } }],
    }),
  },
  {
    id: "command",
    toolCall: tool({
      toolCallId: id("content-story-command"),
      title: "bun vitest run apps/silvercode/tests/content-layout.test.tsx",
      kind: "execute",
      status: "completed",
      content: [
        {
          type: "content",
          content: {
            type: "text",
            text: "✓ prose lane wraps\n✓ wide table fits\n✓ timestamps stay attached to prose\n",
          },
        },
      ],
    }),
  },
  {
    id: "edit",
    toolCall: tool({
      toolCallId: id("content-story-edit"),
      title: "Edited src/components/MarkdownView.tsx",
      kind: "edit",
      status: "completed",
      content: [
        {
          type: "diff",
          path: "src/components/MarkdownView.tsx",
          oldText: "ResponsiveTable",
          newText: "Content.Table",
        },
      ],
    }),
  },
]

const markdownTable =
  "| File | Status | Notes |\n" +
  "| --- | --- | --- |\n" +
  "| src/components/SessionUpdateList.tsx | complete | timestamps attach to the prose lane while wide blocks can still use wider space |\n" +
  "| src/components/MarkdownView.tsx | complete | markdown delegates table rendering to Content.Table |\n"

const tableHeaders = ["File", "Status", "Long Notes"]
const tableRows = [
  ["Content.tsx", "complete", "default table chooses prose, wide, full, or cards from layout lanes"],
  ["MarkdownView.tsx", "complete", "markdown tables render through Content.Table"],
]

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      <Content.Prose>
        <Text bold color="$primary">
          {title}
        </Text>
      </Content.Prose>
      {children}
    </Box>
  )
}

export const contentLayout: Story = {
  id: "Content/layout",
  component: "Content",
  variant: "layout",
  description: "Content lanes, side slots, tables, markdown, and activity summary width behavior.",
  knobs: [
    {
      kind: "select",
      id: "activity",
      label: "Activity",
      options: ["collapsed", "expanded"],
      default: "collapsed",
    },
  ],
  render(knobs) {
    const activityExpanded = knobs.activity === "expanded"
    return (
      <Screen flexDirection="column">
        <Content.Layout gap={1}>
          <Box flexDirection="column" gap={1} width="100%">
            <Section title="Prose row with timestamp slots">
              <Content.Row>
                <Content.Left>
                  <Content.Aside>14:08</Content.Aside>
                </Content.Left>
                <Content.Prose>
                  <Text wrap="wrap">
                    Assistant prose stays in the centered readable lane. The timestamp is anchored just outside the
                    prose boundary, not to the pane edge.
                  </Text>
                </Content.Prose>
              </Content.Row>
              <Content.Row>
                <Content.Prose>
                  <Box flexDirection="row" justifyContent="flex-end" width="100%" paddingRight={1}>
                    <Box width={48} paddingX={1} paddingY={1}>
                      <Text backgroundColor="$bg-surface-subtle" wrap="wrap">
                        User prompt bubble aligns inside prose.
                      </Text>
                    </Box>
                  </Box>
                </Content.Prose>
                <Content.Right>
                  <Content.Aside>14:09</Content.Aside>
                </Content.Right>
              </Content.Row>
            </Section>

            <Section title="Wide and full lanes">
              <Content.Wide>
                <Box borderStyle="single" borderColor="$border" paddingX={1}>
                  <Text wrap="wrap">Wide lane is bounded and centered. It is wider than prose, but not full pane.</Text>
                </Box>
              </Content.Wide>
              <Content.Full>
                <Box borderStyle="single" borderColor="$border" paddingX={1}>
                  <Text wrap="wrap">Full lane spans the pane for content that truly needs the whole available width.</Text>
                </Box>
              </Content.Full>
            </Section>

            <Section title="Markdown table through Content.Table">
              <MarkdownView source={markdownTable} />
            </Section>

            <Section title="Explicit table variants">
              <Content.Table headers={tableHeaders} rows={tableRows} />
              <Content.Table.Grid headers={tableHeaders} rows={tableRows} widths={[16, 10, 36]} />
              <Content.Table.Cards headers={tableHeaders} rows={tableRows} />
            </Section>

            <Section title="Activity summary">
              <TurnActivitySummary items={activityItems} defaultExpanded={activityExpanded} />
            </Section>
          </Box>
        </Content.Layout>
      </Screen>
    )
  },
}
