#!/usr/bin/env bun
/**
 * Codemods runner - runs jscodeshift transformations on codebase
 *
 * This script:
 * 1. Defines codemod transformations as exports
 * 2. Reads ESLint config to determine which files to process
 * 3. Runs jscodeshift with this file as the transform
 */

import { $ } from "bun"
import { resolve } from "path"

// ============================================================================
// RUNNER (only runs when executed directly, not when imported)
// ============================================================================

if (import.meta.main) {
  // Import ESLint config to extract ignore patterns
  const eslintConfigPath = resolve(import.meta.dir, "../eslint.config.js")
  const eslintConfig = await import(eslintConfigPath)

  // Extract ignore patterns from ESLint config
  const config = eslintConfig.default
  const ignorePatterns: string[] = []

  for (const rule of config) {
    if (rule.ignores) {
      if (Array.isArray(rule.ignores)) ignorePatterns.push(...rule.ignores)
      else ignorePatterns.push(rule.ignores)
    }
  }

  const uniqueIgnorePatterns = [...new Set(ignorePatterns)]

  // Build jscodeshift command
  // Pass directories - jscodeshift will recursively find .ts/.tsx files
  const args = [
    "jscodeshift",
    "-t",
    __filename, // Use this file as the transform
    "src", // Recursively process src
    "scripts", // Process scripts directory
    "tests", // Process tests directory
    "--parser=tsx",
    "--extensions=ts,tsx",
    "--gitignore",
    "--silent" // Only output modified files
  ]

  // Add ignore patterns from ESLint config
  for (const pattern of uniqueIgnorePatterns) {
    args.push(`--ignore-pattern=${pattern}`)
  }

  // Run jscodeshift
  try {
    const result = await $`bunx ${args}`.text()
    // jscodeshift with --silent prints one line per modified file
    const output = result.trim()
    // Filter out jscodeshift's own status messages, only show actual file changes
    const filtered = output
      .split("\n")
      .filter((line) => !line.match(/^(No files selected|Processing \d+ files)/))
      .join("\n")
      .trim()
    if (filtered) console.log(filtered)
  } catch (error) {
    console.error("Codemod failed:", error)
    process.exit(1)
  }
}

// ============================================================================
// CODEMOD TRANSFORMATIONS
// ============================================================================

/**
 * Collapse simple control-flow blocks to single-line statements without braces.
 *
 * Examples:
 *
 *   if (cond) {
 *     doSomething()
 *   }
 *   =>
 *   if (cond) doSomething()
 *
 *   for (const x of xs) {
 *     process(x)
 *   }
 *   =>
 *   for (const x of xs) process(x)
 *
 *   while (running) {
 *     tick()
 *   }
 *   =>
 *   while (running) tick()
 */
export default function collapseSingleLineBlocks(file: any, api: any) {
  const MAX_LINE_LENGTH = 100 // tweak to taste
  const j = api.jscodeshift
  const root = j(file.source)

  function hasComments(node: any) {
    if (!node) return false
    return Boolean(
      (node.comments && node.comments.length) ||
      (node.leadingComments && node.leadingComments.length) ||
      (node.trailingComments && node.trailingComments.length) ||
      (node.innerComments && node.innerComments.length)
    )
  }

  // What kinds of single statements we're comfortable putting on one line.
  const ALLOWED_SIMPLE_TYPES = new Set([
    "ExpressionStatement",
    "ReturnStatement",
    "ThrowStatement",
    "ContinueStatement",
    "BreakStatement",
    "VariableDeclaration" // but only with 1 declarator
  ])

  function isAllowedSingleStatement(stmt: any) {
    if (!stmt) return false
    if (!ALLOWED_SIMPLE_TYPES.has(stmt.type)) return false

    if (stmt.type === "VariableDeclaration") {
      // Avoid "let a = 1, b = 2" etc.
      if (!stmt.declarations || stmt.declarations.length !== 1) return false
    }

    return true
  }

  /**
   * Estimate how long the final single-line construct would be.
   * Uses pretty conservative stringification via jscodeshift.
   */
  function wouldBeTooLong(kind: any, node: any, stmt: any) {
    try {
      let head = ""

      if (kind === "if") {
        const testCode = j(node.test).toSource()
        const stmtCode = j(stmt).toSource()
        // "if (test) stmt"
        head = `if (${testCode}) ${stmtCode}`
      } else if (kind === "for" || kind === "forIn" || kind === "forOf") {
        const leftCode = j(node.left ?? node.init).toSource()
        const rightCode = j(node.right ?? node.test).toSource()
        const stmtCode = j(stmt).toSource()

        if (kind === "for") {
          const initCode = j(node.init).toSource()
          const testCode = node.test ? j(node.test).toSource() : ""
          const updateCode = node.update ? j(node.update).toSource() : ""
          head = `for (${initCode}; ${testCode}; ${updateCode}) ${stmtCode}`
        } else if (kind === "forIn") {
          head = `for (${leftCode} in ${rightCode}) ${stmtCode}`
        } else if (kind === "forOf") {
          head = `for (${leftCode} of ${rightCode}) ${stmtCode}`
        }
      } else if (kind === "while") {
        const testCode = j(node.test).toSource()
        const stmtCode = j(stmt).toSource()
        head = `while (${testCode}) ${stmtCode}`
      } else if (kind === "doWhile") {
        const testCode = j(node.test).toSource()
        const stmtCode = j(stmt).toSource()
        head = `do ${stmtCode} while (${testCode});`
      } else {
        return false
      }

      return head.length > MAX_LINE_LENGTH
    } catch {
      // If anything goes wrong, be conservative and don't transform.
      return true
    }
  }

  /**
   * Generic helper: given a node with a .body that might be a BlockStatement,
   * see if we can safely collapse it to a single statement.
   */
  function maybeCollapseBody(kind: any) {
    return function (path: any) {
      const node = path.node
      const bodyKey = kind === "if" ? "consequent" : "body"
      const block = node[bodyKey]

      if (!block || block.type !== "BlockStatement") return

      const body = block.body
      if (!body || body.length !== 1) return

      const stmt = body[0]

      // Skip if comments are involved (block or statement).
      if (hasComments(block) || hasComments(stmt)) return

      // Extra constraints specific to each kind:

      if (kind === "if") {
        // No else; avoids dangling else confusion.
        if (node.alternate) return
      }

      if (!isAllowedSingleStatement(stmt)) return

      // Heuristic: don't create overly long single lines.
      if (wouldBeTooLong(kind, node, stmt)) return

      // Finally, do the transformation.
      node[bodyKey] = stmt
    }
  }

  //
  // 1) if ( ... ) { stmt; }
  //
  root.find(j.IfStatement).forEach(maybeCollapseBody("if"))

  //
  // 2) for (...) { stmt; }
  //
  root.find(j.ForStatement).forEach(maybeCollapseBody("for"))

  //
  // 3) for (x in y) { stmt; }, for (x of y) { stmt; }
  //
  root.find(j.ForInStatement).forEach(maybeCollapseBody("forIn"))
  root.find(j.ForOfStatement).forEach(maybeCollapseBody("forOf"))

  //
  // 4) while (cond) { stmt; }
  //
  root.find(j.WhileStatement).forEach(maybeCollapseBody("while"))

  //
  // 5) do { stmt; } while (cond);
  //
  root.find(j.DoWhileStatement).forEach(maybeCollapseBody("doWhile"))

  return root.toSource({
    quote: "double",
    reuseWhitespace: false
  })
}

export const parser = "tsx"
