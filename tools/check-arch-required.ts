#!/usr/bin/env bun
/**
 * check-arch-required — Drift-checker for /arch protocol.
 *
 * Inspects staged + unstaged paths and arguments-passed paths.
 * If any match an architectural-trigger glob, looks for a recent
 * .claude/arch-decisions/<date>-<topic>.md retro covering it.
 * If none, exits 1 — /max should abort.
 *
 * Usage:
 *   bun tools/check-arch-required.ts            # check git status
 *   bun tools/check-arch-required.ts <path>...  # check explicit paths
 *   bun tools/check-arch-required.ts --json     # machine-readable output
 *
 * Exit codes:
 *   0 = no /arch required, OR /arch required AND covered by recent retro
 *   1 = /arch required AND no covering retro found
 *
 * Trigger taxonomy lives in TRIGGERS below — keep in sync with
 * .claude/skills/arch/SKILL.md "When /arch is MANDATORY".
 *
 * Companion skill: /arch (.claude/skills/arch/SKILL.md)
 * Origin bead: @km/all/architectural-decision-skill
 */

import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

interface Trigger {
  topic: string;
  description: string;
  match: (path: string) => boolean;
}

const TRIGGERS: Trigger[] = [
  {
    topic: "identity",
    description: "Bead id form, ULID vs path, frontmatter id contract",
    match: (p) =>
      /packages\/km-beads\/src\/(migrate|identity|alias|repo|loader)/i.test(p) ||
      /packages\/km-beads\/src\/.*-id\b/i.test(p),
  },
  {
    topic: "storage",
    description: "SQLite schema, on-disk shape, repo-api, persistence",
    match: (p) =>
      /packages\/km-storage\//i.test(p) ||
      /packages\/km-core\/src\/(repo|schema|persistence|store)/i.test(p),
  },
  {
    topic: "core-data-model",
    description: "KNode shape, KTree shape, item-vs-block, board hierarchy",
    match: (p) =>
      /packages\/km-core\/src\/(knode|ktree|node|tree|item|board|hierarchy)/i.test(p),
  },
  {
    topic: "loader-lifecycle",
    description: "Repo discovery, vault scan, mount/unmount, cleanup, scope",
    match: (p) =>
      /packages\/km-(core|tree|board|storage)\/src\/(loader|discovery|mount|scope|lifecycle)/i.test(p),
  },
  {
    topic: "public-api",
    description: "Package exports, CLI command shape, frontmatter, link URI",
    match: (p) =>
      /packages\/[^/]+\/(src\/exports?|src\/index)\.tsx?$/i.test(p) ||
      /packages\/km-commands\/src\/(commands|registry)/i.test(p),
  },
  {
    topic: "rendering-pipeline",
    description: "Silvery pipeline boundaries, layout engine, output phase",
    match: (p) => /vendor\/silvery\/packages\/ag-term\/src\/pipeline\//i.test(p),
  },
];

const REPO_ROOT = (() => {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch {
    return process.cwd();
  }
})();

const ARCH_DECISIONS_DIR = join(REPO_ROOT, ".claude", "arch-decisions");
const RETRO_TTL_DAYS = 7;

function changedPaths(extraArgs: string[]): string[] {
  if (extraArgs.length > 0) return extraArgs;
  try {
    const out = execSync("git status --porcelain", { encoding: "utf8", cwd: REPO_ROOT });
    // Format: "XY path" — take everything after the first space.
    return out
      .split("\n")
      .map((line) => line.replace(/^.{2,3}/, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

interface RetroFile {
  path: string;
  date: Date;
  topics: string[];
  body: string;
}

function loadRetros(): RetroFile[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(ARCH_DECISIONS_DIR);
  } catch {
    return [];
  }
  const cutoff = Date.now() - RETRO_TTL_DAYS * 24 * 60 * 60 * 1000;
  const retros: RetroFile[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md") || entry === "README.md") continue;
    const fullPath = join(ARCH_DECISIONS_DIR, entry);
    let mtime: Date;
    try {
      mtime = statSync(fullPath).mtime;
    } catch {
      continue;
    }
    if (mtime.getTime() < cutoff) continue;
    let body: string;
    try {
      body = readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }
    // Extract `topic:` from frontmatter, plus any embedded TRIGGERS topic words.
    const topicMatch = body.match(/^topic:\s*"?([^"\n]+)"?/m);
    const topics: string[] = [];
    const frontmatterTopic = topicMatch?.[1];
    if (frontmatterTopic) topics.push(frontmatterTopic.toLowerCase());
    for (const t of TRIGGERS) {
      if (body.toLowerCase().includes(t.topic)) topics.push(t.topic);
    }
    retros.push({ path: fullPath, date: mtime, topics, body: body.toLowerCase() });
  }
  return retros;
}

interface CheckResult {
  required: boolean;
  triggered: { path: string; topic: string }[];
  covered: { topic: string; retro: string }[];
  uncovered: string[];
}

function check(paths: string[]): CheckResult {
  const triggered: { path: string; topic: string }[] = [];
  for (const p of paths) {
    for (const t of TRIGGERS) {
      if (t.match(p)) triggered.push({ path: p, topic: t.topic });
    }
  }
  if (triggered.length === 0) {
    return { required: false, triggered: [], covered: [], uncovered: [] };
  }
  const retros = loadRetros();
  const triggeredTopics = new Set(triggered.map((t) => t.topic));
  const covered: { topic: string; retro: string }[] = [];
  const uncovered: string[] = [];
  for (const topic of triggeredTopics) {
    const match = retros.find((r) => r.topics.includes(topic));
    if (match) covered.push({ topic, retro: match.path });
    else uncovered.push(topic);
  }
  return { required: true, triggered, covered, uncovered };
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const paths = changedPaths(args.filter((a) => !a.startsWith("--")));
  const result = check(paths);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.uncovered.length > 0 ? 1 : 0);
  }

  if (!result.required) {
    console.log("✓ /arch not required — no architectural triggers in changed paths.");
    process.exit(0);
  }

  console.log(`/arch triggers detected:\n`);
  for (const t of result.triggered) {
    console.log(`  ${t.topic.padEnd(20)} ${t.path}`);
  }
  console.log();

  if (result.covered.length > 0) {
    console.log("Covered by recent retro:");
    for (const c of result.covered) {
      console.log(`  ${c.topic.padEnd(20)} ${c.retro.replace(REPO_ROOT + "/", "")}`);
    }
    console.log();
  }

  if (result.uncovered.length > 0) {
    console.log("UNCOVERED — /arch retro required for:");
    for (const u of result.uncovered) {
      const desc = TRIGGERS.find((t) => t.topic === u)?.description ?? "";
      console.log(`  ${u.padEnd(20)} ${desc}`);
    }
    console.log();
    console.log(
      `Run /arch <topic> for each uncovered topic, write retro to ${ARCH_DECISIONS_DIR.replace(REPO_ROOT + "/", "")}/, then re-run.`,
    );
    console.log(`Skill: .claude/skills/arch/SKILL.md`);
    process.exit(1);
  }

  console.log("✓ All triggered topics covered by recent retros — /arch gate passed.");
  process.exit(0);
}

main();
