/**
 * Passive hierarchical data display with Table column sizing and truncation.
 * The consumer controls visibility by returning only visible children.
 */

import React, { useMemo } from "react"
import {
  TABLE_CELL_PREFIX,
  Table,
  type Column,
  type InternalColumn,
  type TableProps,
} from "../../components/Table"
import { Text } from "../../components/Text"
import { flattenTree, formatTreeGuide, type TreeGuideStyle } from "./_tree-layout"

type NonEmptyColumns<T> = readonly [Column<T>, ...Column<T>[]]

type PassiveTableProps<T> = Extract<TableProps<T>, { interactive?: false }>

export type TreeTableProps<T> = Omit<PassiveTableProps<T>, "columns"> & {
  /** At least one column; the first column receives the tree guide. */
  columns: NonEmptyColumns<T>
  /** Return the children currently visible beneath an item. */
  getChildren: (item: T) => readonly T[] | undefined
  /** Terminal-safe guide character set. */
  guideStyle: TreeGuideStyle
  /** Include a branch/last guide on each root row. Default: false. */
  showRootGuide?: boolean
}

export function TreeTable<T>({
  data,
  columns,
  getChildren,
  guideStyle,
  showRootGuide = false,
  ...tableProps
}: TreeTableProps<T>): React.ReactElement {
  const flatItems = useMemo(
    () => flattenTree(data, getChildren, showRootGuide),
    [data, getChildren, showRootGuide],
  )
  const flatData = useMemo(() => flatItems.map(({ item }) => item), [flatItems])

  const tableColumns = useMemo(() => {
    const [treeColumn, ...rest] = columns
    const column: InternalColumn<T> = {
      ...treeColumn,
      [TABLE_CELL_PREFIX]: (_item, index) => {
        const text = formatTreeGuide(flatItems[index]?.guides ?? [], guideStyle)
        if (text.length === 0) return undefined
        return {
          text,
          node: (
            <Text color="$fg-muted" flexShrink={0}>
              {text}
            </Text>
          ),
        }
      },
    }
    return [column, ...rest]
  }, [columns, flatItems, guideStyle])

  return <Table {...tableProps} data={flatData} columns={tableColumns} />
}
