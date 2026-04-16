/**
 * km-wikilink — Micromark tokenizer + mdast handler for Obsidian-style wikilinks.
 *
 * Syntax: [[target]], [[target|alias]], ![[embed]], [[target#section]],
 *         [[target#^blockRef]], [[#section]], [[^blockRef]].
 *
 * Produces a `KmWikilink` mdast node (see kmast/types.ts).
 */

/* oxlint-disable typescript-eslint/no-unsafe-call, typescript-eslint/no-unsafe-member-access, typescript-eslint/no-unsafe-return, typescript-eslint/no-unsafe-assignment, typescript-eslint/no-unsafe-argument, typescript-eslint/no-explicit-any -- Micromark tokenizer API is inherently untyped */

import type { Extension as MicromarkExtension } from "micromark-util-types"
import type { Extension as FromMarkdownExtension, CompileContext } from "mdast-util-from-markdown"
import type { Token } from "micromark-util-types"
import type { KmWikilink } from "../kmast/types.ts"

// =============================================================================
// Micromark syntax extension
// =============================================================================

export function kmWikilink(): MicromarkExtension {
  return {
    text: {
      91: { name: "kmWikilink", tokenize: tokenizeWikilink }, // [
      33: { name: "kmWikilinkEmbed", tokenize: tokenizeWikilinkEmbed }, // !
    },
  }
}

/**
 * Shared state machine body for both `[[...]]` and `![[...]]`.
 * The caller must have already consumed the opening markers and entered `kmWikilink`.
 */
function wikilinkBody(effects: any, ok: any, nok: any) {
  // We've just consumed `[[` (or `![[`) and exited kmWikilinkMarker.
  // Check if target is empty (same-file refs like [[#heading]], [[^block]])
  return beforeTarget

  function beforeTarget(code: number | null): any {
    if (code === null || code === 91 || code === -5 || code === -4 || code === -3) return nok(code)
    // Empty target — skip directly to separator handling
    if (code === 35) {
      effects.enter("kmWikilinkMarker")
      effects.consume(code)
      effects.exit("kmWikilinkMarker")
      return afterHash
    }
    if (code === 94) {
      effects.enter("kmWikilinkMarker")
      effects.consume(code)
      effects.exit("kmWikilinkMarker")
      effects.enter("kmWikilinkBlockRef")
      return insideBlockRef
    }
    if (code === 93) {
      // [[]] — empty, close immediately
      return closeBracket1(code)
    }
    // Non-empty target — enter target token and consume
    effects.enter("kmWikilinkTarget")
    effects.consume(code)
    return insideTarget
  }

  function insideTarget(code: number | null): any {
    if (code === null || code === 91 || code === -5 || code === -4 || code === -3) return nok(code) // EOF, nested [, or newline
    if (code === 93) {
      effects.exit("kmWikilinkTarget")
      return closeBracket1(code)
    }
    if (code === 35) {
      effects.exit("kmWikilinkTarget")
      effects.enter("kmWikilinkMarker")
      effects.consume(code)
      effects.exit("kmWikilinkMarker")
      return afterHash
    }
    if (code === 94) {
      effects.exit("kmWikilinkTarget")
      effects.enter("kmWikilinkMarker")
      effects.consume(code)
      effects.exit("kmWikilinkMarker")
      effects.enter("kmWikilinkBlockRef")
      return insideBlockRef
    }
    if (code === 124) {
      effects.exit("kmWikilinkTarget")
      effects.enter("kmWikilinkMarker")
      effects.consume(code)
      effects.exit("kmWikilinkMarker")
      effects.enter("kmWikilinkAlias")
      return insideAlias
    }
    effects.consume(code)
    return insideTarget
  }

  function afterHash(code: number | null): any {
    if (code === null || code === 91) return nok(code)
    if (code === 94) {
      // ^  after # — blockRef
      effects.enter("kmWikilinkMarker")
      effects.consume(code) // consume ^
      effects.exit("kmWikilinkMarker")
      effects.enter("kmWikilinkBlockRef")
      return insideBlockRef
    }
    if (code === 93) {
      // ] right after # — treat as empty section
      return closeBracket1(code)
    }
    // Start section content
    effects.enter("kmWikilinkSection")
    return insideSection(code)
  }

  function insideSection(code: number | null): any {
    if (code === null || code === 91 || code === -5 || code === -4 || code === -3) return nok(code)
    if (code === 93) {
      effects.exit("kmWikilinkSection")
      return closeBracket1(code)
    }
    if (code === 35) {
      // # — another hash, could lead to ^blockRef
      effects.exit("kmWikilinkSection")
      effects.enter("kmWikilinkMarker")
      effects.consume(code) // consume #
      effects.exit("kmWikilinkMarker")
      return afterHash
    }
    if (code === 94) {
      // ^ — blockRef
      effects.exit("kmWikilinkSection")
      effects.enter("kmWikilinkMarker")
      effects.consume(code) // consume ^
      effects.exit("kmWikilinkMarker")
      effects.enter("kmWikilinkBlockRef")
      return insideBlockRef
    }
    if (code === 124) {
      // | — alias
      effects.exit("kmWikilinkSection")
      effects.enter("kmWikilinkMarker")
      effects.consume(code) // consume |
      effects.exit("kmWikilinkMarker")
      effects.enter("kmWikilinkAlias")
      return insideAlias
    }
    effects.consume(code)
    return insideSection
  }

  function insideBlockRef(code: number | null): any {
    if (code === null || code === 91 || code === -5 || code === -4 || code === -3) return nok(code)
    if (code === 93) {
      effects.exit("kmWikilinkBlockRef")
      return closeBracket1(code)
    }
    if (code === 124) {
      // | — alias
      effects.exit("kmWikilinkBlockRef")
      effects.enter("kmWikilinkMarker")
      effects.consume(code) // consume |
      effects.exit("kmWikilinkMarker")
      effects.enter("kmWikilinkAlias")
      return insideAlias
    }
    effects.consume(code)
    return insideBlockRef
  }

  function insideAlias(code: number | null): any {
    if (code === null || code === 91 || code === -5 || code === -4 || code === -3) return nok(code)
    if (code === 93) {
      effects.exit("kmWikilinkAlias")
      return closeBracket1(code)
    }
    effects.consume(code)
    return insideAlias
  }

  function closeBracket1(code: number | null): any {
    if (code !== 93) return nok(code)
    effects.enter("kmWikilinkMarker")
    effects.consume(code) // first ]
    return closeBracket2
  }

  function closeBracket2(code: number | null): any {
    if (code !== 93) return nok(code)
    effects.consume(code) // second ]
    effects.exit("kmWikilinkMarker")
    effects.exit("kmWikilink")
    return ok(code)
  }
}

/** Tokenizer for `[[...]]` — triggered by `[`. */
function tokenizeWikilink(this: any, effects: any, ok: any, nok: any) {
  return start

  function start(code: number | null) {
    if (code !== 91) return nok(code) // [
    effects.enter("kmWikilink")
    effects.enter("kmWikilinkMarker")
    effects.consume(code) // first [
    return openBracket2
  }

  function openBracket2(code: number | null) {
    if (code !== 91) return nok(code)
    effects.consume(code) // second [
    effects.exit("kmWikilinkMarker")
    return wikilinkBody(effects, ok, nok)
  }
}

/** Tokenizer for `![[...]]` — triggered by `!`. */
function tokenizeWikilinkEmbed(this: any, effects: any, ok: any, nok: any) {
  return start

  function start(code: number | null) {
    if (code !== 33) return nok(code) // !
    effects.enter("kmWikilink")
    effects.enter("kmWikilinkEmbed")
    effects.consume(code) // consume !
    effects.exit("kmWikilinkEmbed")
    return afterBang
  }

  function afterBang(code: number | null) {
    if (code !== 91) return nok(code) // [
    effects.enter("kmWikilinkMarker")
    effects.consume(code) // first [
    return openBracket2
  }

  function openBracket2(code: number | null) {
    if (code !== 91) return nok(code)
    effects.consume(code) // second [
    effects.exit("kmWikilinkMarker")
    return wikilinkBody(effects, ok, nok)
  }
}

// =============================================================================
// mdast fromMarkdown extension
// =============================================================================

export function kmWikilinkFromMarkdown(): FromMarkdownExtension {
  return {
    enter: {
      kmWikilink: enterWikilink,
    },
    exit: {
      kmWikilinkTarget: exitTarget,
      kmWikilinkSection: exitSection,
      kmWikilinkBlockRef: exitBlockRef,
      kmWikilinkAlias: exitAlias,
      kmWikilinkEmbed: exitEmbed,
      kmWikilink: exitWikilink,
    },
  }
}

function enterWikilink(this: CompileContext, token: Token) {
  const node: KmWikilink = {
    type: "kmWikilink",
    target: "",
    embedded: false,
  }
  this.enter(node as any, token)
}

function exitEmbed(this: CompileContext, _token: Token) {
  const node = this.stack[this.stack.length - 1] as unknown as KmWikilink
  node.embedded = true
}

function exitTarget(this: CompileContext, token: Token) {
  const node = this.stack[this.stack.length - 1] as unknown as KmWikilink
  const raw = this.sliceSerialize(token)
  // Detect ./ prefix for relative child references
  if (raw.startsWith("./")) {
    node.target = raw.slice(2)
    node.relative = true
  } else {
    node.target = raw
  }
}

function exitSection(this: CompileContext, token: Token) {
  const node = this.stack[this.stack.length - 1] as unknown as KmWikilink
  node.section = this.sliceSerialize(token)
}

function exitBlockRef(this: CompileContext, token: Token) {
  const node = this.stack[this.stack.length - 1] as unknown as KmWikilink
  node.blockRef = this.sliceSerialize(token)
}

function exitAlias(this: CompileContext, token: Token) {
  const node = this.stack[this.stack.length - 1] as unknown as KmWikilink
  node.alias = this.sliceSerialize(token)
}

function exitWikilink(this: CompileContext, token: Token) {
  this.exit(token)
}
