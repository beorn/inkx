export type TreeGuide = "space" | "continuation" | "branch" | "last"

export type FlatTreeItem<T> = Readonly<{
  item: T
  depth: number
  guides: readonly TreeGuide[]
}>

export type TreeGuideStyle = "unicode" | "ascii"

const GUIDE_TEXT: Record<TreeGuideStyle, Record<TreeGuide, string>> = {
  unicode: {
    space: "    ",
    continuation: "│   ",
    branch: "├── ",
    last: "└── ",
  },
  ascii: {
    space: "    ",
    continuation: "|   ",
    branch: "|-- ",
    last: "`-- ",
  },
}

export function flattenTree<T>(
  data: readonly T[],
  getChildren: (item: T) => readonly T[] | undefined,
  showRootGuide: boolean = false,
): FlatTreeItem<T>[] {
  const result: FlatTreeItem<T>[] = []

  const visit = (items: readonly T[], depth: number, ancestorContinuations: readonly boolean[]) => {
    for (const [index, item] of items.entries()) {
      const isLast = index === items.length - 1
      const guides: TreeGuide[] =
        depth === 0 && !showRootGuide
          ? []
          : [
              ...ancestorContinuations.map<TreeGuide>((continues) =>
                continues ? "continuation" : "space",
              ),
              isLast ? "last" : "branch",
            ]

      result.push({ item, depth, guides })

      const children = getChildren(item)
      if (children?.length) {
        const childContinuations =
          depth === 0 && !showRootGuide ? [] : [...ancestorContinuations, !isLast]
        visit(children, depth + 1, childContinuations)
      }
    }
  }

  visit(data, 0, [])
  return result
}

export function formatTreeGuide(guides: readonly TreeGuide[], style: TreeGuideStyle): string {
  return guides.map((guide) => GUIDE_TEXT[style][guide]).join("")
}
