/**
 * Add Command
 *
 * Add tasks to boards/lists via transclusion (link).
 * Tasks are linked to the board without changing their original location.
 * Sigil targets (@next, +project, #tag) also tag the source task content.
 *
 * km add @next TASKID          # Link task to @next board + add @next sigil
 * km add @next ./inbox/**      # Link all inbox tasks to @next
 * km add +project TASKID       # Link task to project + add +project sigil
 * km add #urgent TASKID        # Link task to #urgent + add #urgent sigil
 * km add myboard TASKID        # Link only (no sigil — not a sigil target)
 */
import { Command } from "@silvery/commander"
import { createTerm } from "@silvery/ag-react"

const term = createTerm(process)
import { realpathSync } from "fs"
import { resolve } from "path"
import { resolvePathArg, buildSymlinkChild } from "@km/storage"
import { KNode, type KNode as KNodeType } from "@km/core"
import { getRootPath } from "../program.ts"
import { loadRepo } from "../load-repo.ts"

/** Show phase completion with timing */
function phaseOk(label: string, detail?: string, startMs?: number): void {
  const timing = startMs != null ? ` ${term.dim(`${Date.now() - startMs}ms`)}` : ""
  const suffix = detail ? ` ${term.dim(`(${detail})`)}` : ""
  console.log(`${term.green("✔")} ${label}${suffix}${timing}`)
}

// Sigil prefix → data key mapping
const SIGIL_DATA_KEY: Record<string, string> = {
  "@": "mentions",
  "+": "projects",
  "#": "tags",
}

/** Check if a task's content already contains the sigil (e.g., @next, +project, #tag) */
function contentHasSigil(node: KNodeType, prefix: string, name: string): boolean {
  const dataKey = SIGIL_DATA_KEY[prefix]
  if (!dataKey) return false

  // Fast path: check structured data
  const existing = node.data?.[dataKey]
  if (Array.isArray(existing) && existing.includes(name)) return true

  // Fallback: check raw content for the sigil string
  if (node.content?.includes(prefix + name)) return true

  return false
}

/** Convert an absolute glob to repo-relative, or throw if outside the repo */
function toRepoRelativeGlob(source: string, repoRoot: string): string {
  if (!source.startsWith("/")) return source

  // Split into base path + glob suffix (e.g., "/tmp/vt/projects/**" → base + "/**")
  const globIdx = source.indexOf("**")
  const basePath = source.slice(0, globIdx).replace(/\/$/, "")
  const suffix = source.slice(globIdx > 0 ? globIdx - 1 : source.length)

  let realBase: string
  try {
    realBase = realpathSync(basePath)
  } catch {
    realBase = resolve(basePath)
  }
  let realRoot: string
  try {
    realRoot = realpathSync(repoRoot)
  } catch {
    realRoot = resolve(repoRoot)
  }

  if (realBase === realRoot) return "." + suffix
  if (realBase.startsWith(realRoot + "/")) {
    return "./" + realBase.slice(realRoot.length + 1) + suffix
  }

  throw new Error(`Path is outside the repo: ${source}`)
}

export const addCommand = new Command("add")
  .description("Add tasks to a board or list")
  .argument("<target>", "Target board/list (ID, path, or filename like @next)")
  .argument("<source...>", "Task IDs or query (e.g., ./inbox/**, status:todo)")
  .option("--dry-run", "Preview without making changes")
  .option("--json", "Output as JSON")
  .option("--force", "Re-add tasks even if already linked on the target board")
  .option("--quiet", "Suppress progress output")
  .showHelpAfterError(true)
  // oxlint-disable-next-line complexity/complexity -- CLI add with query matching, sigil tagging, and four-way dedup
  .actionMerged(async (opts) => {
    // Detect sigil target (@next, +project, #tag)
    // Match bare sigil (e.g., @next) or extract from path basename (e.g., /tmp/vt/@next)
    const basename = opts.target.replace(/\/$/, "").split("/").pop() ?? opts.target
    const sigilMatch = basename.match(/^([@+#])([a-zA-Z0-9_-]+)$/)
    const sigilPrefix = sigilMatch?.[1] ?? null
    const sigilName = sigilMatch?.[2] ?? null
    const sigilStr = sigilMatch?.[0] ?? null

    const verbose = !opts.json && !opts.quiet && process.stdout.isTTY

    // Resolve target path argument - may detect repo root
    const resolvedTarget = resolvePathArg(opts.target, getRootPath())
    using repo = await loadRepo(resolvedTarget.repoRoot)

    if (!resolvedTarget.nodeRef) {
      console.error(term.red(`Cannot add to a directory`))
      process.exit(1)
    }

    // Resolve target board/container
    let t0 = Date.now()
    const targetNode = repo.resolveNode(resolvedTarget.nodeRef)
    if (!targetNode) {
      console.error(term.red(`Target not found: ${opts.target}`))
      console.error(term.dim("Use ID, path, or filename (e.g., @next, @someday)"))
      process.exit(1)
    }
    if (verbose) phaseOk("Resolve target", targetNode.content?.slice(0, 40) || opts.target, t0)

    // Collect candidate tasks
    t0 = Date.now()
    const candidates: KNodeType[] = []

    for (const source of opts.source) {
      // Glob patterns (e.g., ./inbox/**, /tmp/vt/projects/**) — query directly
      if (source.includes("**")) {
        let querySource: string
        try {
          querySource = toRepoRelativeGlob(source, resolvedTarget.repoRoot)
        } catch (e) {
          console.error(term.red((e as Error).message))
          process.exit(1)
        }
        const queryResults = repo.queryTasks(querySource)
        if (queryResults.length > 0) {
          for (const task of queryResults) {
            if (!candidates.some((t) => t.id === task.id)) {
              candidates.push(task)
            }
          }
        } else {
          console.warn(term.yellow(`No tasks found for: ${source}`))
        }
        continue
      }

      // Resolve source path if it's a filesystem path
      const resolvedSource = resolvePathArg(source, resolvedTarget.repoRoot)

      // Try as node ID/path first
      const nodeRef = resolvedSource.nodeRef ?? source
      const node = repo.resolveNode(nodeRef, { taskOnly: true })
      if (node) {
        candidates.push(node)
        continue
      }

      // Try as query (only returns tasks, not all nodes)
      const queryResults = repo.queryTasks(source)
      if (queryResults.length > 0) {
        for (const task of queryResults) {
          if (!candidates.some((t) => t.id === task.id)) {
            candidates.push(task)
          }
        }
        continue
      }

      // Nothing found
      console.warn(term.yellow(`No tasks found for: ${source}`))
    }

    if (verbose) phaseOk("Query tasks", `${candidates.length} found`, t0)

    if (candidates.length === 0) {
      console.log(term.yellow("No tasks to add"))
      process.exit(0)
    }

    // Find the default column: explicit km.default:: true wins,
    // otherwise first non-collapsed, non-removed section.
    // If no sections exist, items are added directly to the target node.
    t0 = Date.now()
    let actualTarget = targetNode
    const findDefaultSection = (parentId: string): KNodeType | undefined => {
      const children = repo.getChildren(parentId)
      let firstEligible: KNodeType | undefined
      for (const child of children) {
        if (KNode.isOutline(child) && child.fstype === "mdsection") {
          const rules = child.data?.rules as { default?: boolean; collapse?: boolean; removed?: boolean } | undefined
          if (rules?.default) {
            return child // explicit override
          }
          if (!firstEligible && !rules?.collapse && !rules?.removed) {
            firstEligible = child
          }
          const found = findDefaultSection(child.id)
          if (found) return found
        }
      }
      return firstEligible
    }
    const defaultColumn = findDefaultSection(targetNode.id)
    if (defaultColumn) {
      actualTarget = defaultColumn
    }

    // Four-way dedup: for each candidate, determine what actions are needed
    // | Has link? | Has sigil? | Action                    |
    // |-----------|------------|---------------------------|
    // | No        | No         | Create link + add sigil   |
    // | No        | Yes        | Create link only          |
    // | Yes       | No         | Add sigil only (sync up)  |
    // | Yes       | Yes        | Skip entirely             |
    // With --force: always create link + always add sigil
    const existingLinkTargets = opts.force
      ? new Set<string>()
      : new Set(
          repo
            .getSubtree(targetNode.id)
            .filter((n): n is typeof n & { symlink_to: string } => n.symlink_to != null)
            .map((n) => n.symlink_to),
        )

    const tasksToLink: KNodeType[] = []
    const tasksToSigil: KNodeType[] = []
    const skipped: KNodeType[] = []

    for (const task of candidates) {
      const hasLink = existingLinkTargets.has(task.id)
      const hasSigil =
        sigilStr && !opts.force && sigilPrefix && sigilName ? contentHasSigil(task, sigilPrefix, sigilName) : false

      if (opts.force) {
        tasksToLink.push(task)
        if (sigilStr) tasksToSigil.push(task)
      } else if (!hasLink && !hasSigil) {
        tasksToLink.push(task)
        if (sigilStr) tasksToSigil.push(task)
      } else if (!hasLink && hasSigil) {
        tasksToLink.push(task)
      } else if (hasLink && !hasSigil) {
        if (sigilStr) tasksToSigil.push(task)
      } else {
        // Both link and sigil exist — fully skipped
        skipped.push(task)
      }
    }

    if (verbose) {
      const parts = []
      if (tasksToLink.length > 0) parts.push(`${tasksToLink.length} to link`)
      if (tasksToSigil.length > 0) parts.push(`${tasksToSigil.length} to tag`)
      if (skipped.length > 0) parts.push(`${skipped.length} skipped`)
      phaseOk("Dedup", parts.join(", "), t0)
    }

    if (tasksToLink.length === 0 && tasksToSigil.length === 0 && skipped.length > 0) {
      console.log(term.yellow(`All ${skipped.length} task(s) already linked (use --force to re-add)`))
      process.exit(0)
    }

    // Use timestamp-based ordering for new items
    let nextIdx = Date.now()

    if (opts.dryRun) {
      if (tasksToLink.length > 0) {
        console.log(term.cyan("Dry run - would link:"))
        for (const task of tasksToLink) {
          const needsSigil = sigilStr && tasksToSigil.some((t) => t.id === task.id)
          const suffix = needsSigil ? term.cyan(` (+ ${sigilStr})`) : ""
          console.log(`  ${term.dim(task.id.slice(-8))} ${(task.content || "").slice(0, 50)}${suffix}`)
        }
      }
      // Tasks that only need sigil (already linked but missing sigil)
      const sigilOnly = tasksToSigil.filter((t) => !tasksToLink.some((l) => l.id === t.id))
      if (sigilOnly.length > 0) {
        console.log(term.cyan(`\nWould add ${sigilStr} to (already linked):`))
        for (const task of sigilOnly) {
          console.log(
            `  ${term.dim(task.id.slice(-8))} ${(task.content || "").slice(0, 50)} ${term.cyan(`(+ ${sigilStr})`)}`,
          )
        }
      }
      if (skipped.length > 0) {
        console.log(term.yellow(`\nSkipped (already linked + tagged):`))
        for (const task of skipped) {
          console.log(`  ${term.dim(task.id.slice(-8))} ${(task.content || "").slice(0, 50)}`)
        }
      }
      console.log(term.dim(`\nTo: ${targetNode.content || targetNode.fs_path || opts.target}`))
      return
    }

    // Track source files that need FS sync (for sigil updates)
    const sourceFileSyncIds = new Set<string>()

    // Create link nodes + append sigils inside deferred FS
    t0 = Date.now()
    repo.withDeferredFs(() => {
      // Create link nodes
      for (const task of tasksToLink) {
        repo.addNode(actualTarget.id, buildSymlinkChild({ source: task, parentIdx: nextIdx++, type: "p" }))
      }

      // Append sigil to source task content (dedup: skip if already present)
      if (sigilStr && sigilPrefix && sigilName) {
        const dataKey = SIGIL_DATA_KEY[sigilPrefix] ?? "mentions"
        for (const task of tasksToSigil) {
          // Skip transclusion nodes — they mirror the source, don't tag them
          if (KNode.isSymlink(task)) continue

          // Re-check dedup (content may have changed since we checked)
          if (!opts.force && contentHasSigil(task, sigilPrefix, sigilName)) {
            continue
          }

          // Append sigil to content
          const newContent = (task.content || "") + " " + sigilStr

          // Update data with sigil added to the appropriate array
          const existingArray = (task.data?.[dataKey] as string[] | undefined) ?? []
          const newData = {
            ...task.data,
            [dataKey]: existingArray.includes(sigilName) ? existingArray : [...existingArray, sigilName],
          }

          repo.updateNode(task.id, { content: newContent, data: newData })
          sourceFileSyncIds.add(task.id)
        }
      }
    })

    if (verbose) phaseOk("Create links", `${tasksToLink.length}/${tasksToLink.length}`, t0)

    // Sync target board file
    t0 = Date.now()
    repo.syncToFs(actualTarget.id)

    // Sync source task files that had sigils appended
    for (const id of sourceFileSyncIds) {
      repo.syncToFs(id)
    }
    if (verbose) {
      const syncCount = 1 + sourceFileSyncIds.size
      phaseOk("Sync to disk", `${syncCount} file${syncCount !== 1 ? "s" : ""}`, t0)
    }

    const sigilCount = tasksToSigil.filter((t) => !KNode.isSymlink(t)).length

    if (opts.json) {
      console.log(
        JSON.stringify({
          target: targetNode.id,
          linked: tasksToLink.map((t) => t.id),
          count: tasksToLink.length,
          sigiled: sigilStr ? tasksToSigil.map((t) => t.id) : [],
          sigilCount,
          skipped: skipped.map((t) => t.id),
        }),
      )
      return
    }

    if (tasksToLink.length > 0) {
      console.log(term.green("✓"), `Linked ${tasksToLink.length} task(s) to ${targetNode.content || opts.target}`)
      for (const task of tasksToLink.slice(0, 5)) {
        console.log(term.dim(`  ${task.id.slice(-8)} ${(task.content || "").slice(0, 40)}`))
      }
      if (tasksToLink.length > 5) {
        console.log(term.dim(`  ... and ${tasksToLink.length - 5} more`))
      }
    }
    if (sigilStr && sigilCount > 0) {
      console.log(term.green("✓"), `Added ${sigilStr} to ${sigilCount} task(s)`)
    }
    if (skipped.length > 0) {
      console.log(term.dim(`  Skipped ${skipped.length} already linked (use --force to re-add)`))
    }
  })
