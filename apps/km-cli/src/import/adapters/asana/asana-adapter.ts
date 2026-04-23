/**
 * Asana Import Adapter
 *
 * Wraps the existing Asana API and file parsers into the ImportAdapter interface.
 * Both API fetch and JSON file parsing are supported.
 */

import type { ImportAdapter, AdapterParseOptions, AdapterFetchOptions, AdapterFetchResult } from "../../adapter.ts"
import { readFileSync } from "fs"
import type { ImportData, ImportAttachment } from "../../types.ts"
import type { FetchResult } from "./asana-types.ts"
import { parseAsanaFile } from "./asana-file.ts"

/**
 * Asana-specific link conversion: converts Asana task/project URLs to km block references.
 * This runs as a preprocessing step before the generic convert stage.
 */
const ASANA_URL_PATTERNS = [
  /https?:\/\/app\.asana\.com\/0\/\d+\/(\d+)(?:\/f)?/,
  /https?:\/\/app\.asana\.com\/1\/\d+\/task\/(\d+)(?:\?[^\S)]*)?/,
  /https?:\/\/app\.asana\.com\/1\/\d+\/project\/\d+\/task\/(\d+)(?:\?[^\S)]*)?/,
]

function convertAsanaLinks(text: string): string {
  // First pass: convert markdown links [text](asana-url) → [[^GID]]
  // No aliases — smart resolver provides display titles dynamically
  for (const pattern of ASANA_URL_PATTERNS) {
    const mdLinkRe = new RegExp(`\\[([^\\]]*?)\\]\\(${pattern.source}\\)`, "g")
    text = text.replace(mdLinkRe, (_match, _linkText: string, gid: string) => `[[^${gid}]]`)
  }
  // Second pass: convert <asana-url> autolinks → [[^GID]] (consuming angle brackets)
  for (const pattern of ASANA_URL_PATTERNS) {
    text = text.replace(new RegExp(`<${pattern.source}>`, "g"), "[[^$1]]")
  }
  // Third pass: convert bare Asana URLs
  for (const pattern of ASANA_URL_PATTERNS) {
    text = text.replace(new RegExp(pattern.source, "g"), "[[^$1]]")
  }
  return text
}

/** Recursively preprocess all item bodies in ImportData */
function preprocessItems(items: import("../../types.ts").ImportItem[]): void {
  for (const item of items) {
    if (item.body) item.body = convertAsanaLinks(item.body)
    if (item.children) preprocessItems(item.children)
  }
}

export const asanaAdapter: ImportAdapter = {
  id: "asana",
  name: "Asana",
  fileExtensions: [".json"],

  parse(options: AdapterParseOptions): ImportData {
    const content = options.isPath ? readFileSync(options.input, "utf-8") : options.input
    return parseAsanaFile(content)
  },

  async fetch(options: AdapterFetchOptions & Record<string, unknown>): Promise<AdapterFetchResult> {
    const { fetchFromAsana } = await import("./asana-api.ts")
    const result = await fetchFromAsana({
      token: options.token as string,
      downloadDir: options.downloadDir,
      projectFilter: options.projectFilter as string | undefined,
      includeCompleted: (options.includeCompleted as boolean) ?? true,
      includeComments: (options.includeComments as boolean) ?? true,
      includeAttachments: (options.includeAttachments as boolean) ?? true,
      includeCommentLogs: options.includeCommentLogs as boolean | undefined,
      includeUserTaskLists: (options.includeUserTaskLists as boolean) ?? true,
      includeTagTaskLists: (options.includeTagTaskLists as boolean) ?? true,
      workspace: options.workspace as string | undefined,
      record: options.record as boolean | undefined,
    })
    // fetchFromAsana returns ImportData directly or FetchResult depending on record flag
    const data: ImportData = "data" in result ? (result as FetchResult).data : (result as ImportData)
    return { data }
  },

  preprocess(data: ImportData): ImportData {
    for (const project of data.projects) {
      if (project.sections) {
        for (const section of project.sections) {
          preprocessItems(section.items)
        }
      }
      if (project.items) {
        preprocessItems(project.items)
      }
    }
    return data
  },

  refreshAttachmentUrl(_att: ImportAttachment): Promise<string | null> {
    // This is set dynamically when we have a token — see the CLI command
    return Promise.resolve(null)
  },
}
