/**
 * Index File Writer
 *
 * Pure functions for generating index file content and computing filenames.
 * No DB or FS dependencies — used by FsWriter and SyncManager.
 */

/**
 * Generate markdown content for an index file.
 *
 * - "metadata": title (H1) + body paragraphs only
 * - "full": title + body + `![[./child-name]]` embed slots for each child in order
 */
export function generateIndexFileContent(
  title: string,
  body: string,
  children: Array<{ name: string }>,
  materialization: "metadata" | "full",
): string {
  if (!title) {
    throw new Error("generateIndexFileContent: title must not be empty")
  }
  let result = `# ${title}\n`

  // Body paragraphs (if any)
  const trimmedBody = body.trim()
  if (trimmedBody) {
    result += `\n${trimmedBody}\n`
  }

  // Child slots (full mode only)
  if (materialization === "full" && children.length > 0) {
    result += "\n"
    for (const child of children) {
      result += `![[./${child.name}]]\n`
    }
  }

  return result
}

/**
 * Compute the filename for a new index file.
 *
 * - "same-name": folderName + ".md"
 * - "index": "index.md"
 * - "dot-md": ".md"
 */
export function indexFileName(folderName: string, naming: "same-name" | "index" | "dot-md"): string {
  switch (naming) {
    case "same-name":
      return `${folderName}.md`
    case "index":
      return "index.md"
    case "dot-md":
      return ".md"
  }
}
