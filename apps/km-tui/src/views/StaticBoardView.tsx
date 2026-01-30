/**
 * Static Board View
 *
 * Simple static rendering of board state for non-interactive output.
 * Used by `km view --no-interactive` and non-TTY fallback.
 */

import React from "react"
import { Box, Text, useTerm } from "inkx"
import type { TUIBoardState } from "../types.ts"
import { useRepo } from "../repo-context.tsx"
import { getNodeDisplayName } from "../state.ts"
import { renderRich } from "../text/rich.ts"
import { getStatusIcon } from "../icons.ts"

export interface StaticBoardViewProps {
  state: TUIBoardState
}

export function StaticBoardView({
  state,
}: StaticBoardViewProps): React.ReactElement {
  const repo = useRepo()
  const term = useTerm()
  const { columns } = state

  if (columns.length === 0) {
    return <Text>{term.dim("Empty board")}</Text>
  }

  return (
    <Box flexDirection="column">
      {columns.map((col) => (
        <ColumnSection key={col.node.id} col={col} repo={repo} />
      ))}
    </Box>
  )
}

function ColumnSection({
  col,
  repo,
}: {
  col: TUIBoardState["columns"][number]
  repo: ReturnType<typeof useRepo>
}): React.ReactElement {
  const term = useTerm()
  const name = getNodeDisplayName(repo, col.node)
  const count = col.cards.length
  const maxCards = 10

  return (
    <Box flexDirection="column">
      <Text> </Text>
      <Text>
        {term.bold(name)}
        {term.dim(` (${count})`)}
      </Text>
      {col.cards.length === 0 ? (
        <Text>{term.dim("  (empty)")}</Text>
      ) : (
        <>
          {col.cards.slice(0, maxCards).map((card) => (
            <CardRow key={card.node.id} card={card} repo={repo} />
          ))}
          {col.cards.length > maxCards && (
            <Text>{term.dim(`  +${col.cards.length - maxCards} more cards`)}</Text>
          )}
        </>
      )}
    </Box>
  )
}

function CardRow({
  card,
  repo,
}: {
  card: TUIBoardState["columns"][number]["cards"][number]
  repo: ReturnType<typeof useRepo>
}): React.ReactElement {
  const term = useTerm()
  const icon = getStatusIcon(card.node.task_status)
  const rawContent = card.node.content || getNodeDisplayName(repo, card.node)
  const firstLine = rawContent.split("\n")[0] ?? rawContent
  const styledContent = renderRich(firstLine)
  const isDoneOrDropped =
    card.node.task_status === "done" || card.node.task_status === "dropped"
  const content = isDoneOrDropped
    ? term.dim.strikethrough(styledContent)
    : styledContent
  const maxChildren = 3

  // Use string concatenation to avoid inkx rendering bug with ⚠ emoji
  // where text after space gets truncated when using JSX interpolation
  const line = `${icon.char} ${content}`

  return (
    <Box flexDirection="column">
      <Text>{line}</Text>
      {card.children.slice(0, maxChildren).map((child) => {
        const childIcon = getStatusIcon(child.task_status)
        const childLine = (child.content || "").split("\n")[0] ?? ""
        const childContent = renderRich(childLine)
        return (
          <Text key={child.id}>
            {term.dim(`  ${childIcon.char} ${childContent}`)}
          </Text>
        )
      })}
      {card.children.length > maxChildren && (
        <Text>
          {term.dim(`    +${card.children.length - maxChildren} more`)}
        </Text>
      )}
    </Box>
  )
}
